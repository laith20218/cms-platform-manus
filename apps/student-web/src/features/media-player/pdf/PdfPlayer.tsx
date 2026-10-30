import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocument, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { libraryApi } from '@/features/library/services/library-api';
import { usePdfAnnotations } from './usePdfAnnotations';
import { PdfControlsBar } from './PdfControlsBar';
import { ensurePdfWorker } from './pdf-worker';
import { clamp01, newAnnotationId, rectsFromRange, simplifyPoints, strokePathD } from './pdf-geometry';
import type {
  NormalizedPoint, PdfAnnotation, PdfPlayerProps, PdfTool,
} from './pdf-types';
import './pdf-text-layer.css';
ensurePdfWorker();

/**
 * Wave 11.8 / F2 — PdfPlayer (Phase 1).
 *
 * Engine: pdfjs-dist (supervisor D1) rendering each page to <canvas> with the
 * pdf.js TextLayer above it (selectable per D2), and ONE SVG annotation overlay
 * per page carrying both the highlight rects and the ink strokes (declarative,
 * so zoom re-renders are prop-driven instead of manual canvas bitmap redraws).
 *
 * Geometry contract: everything annotation-related is stored in page-normalized
 * coordinates (0..1) — highlight rects and ink points both — so zoom/viewport
 * changes never re-anchor annotations (D.4e).
 *
 * Tools (D4): pointer (select/navigate), highlighter (text-selection based,
 * D.4d), pen (Pointer Events + coalesced sampling + RDP simplify on commit).
 * Page nav (input + prev/next), zoom (steps × fit-width), 48px targets, RTL.
 *
 * Protection interplay (D2): the text layer carries data-pdf-text-layer —
 * usePlayerProtection lets selectstart through there while copy/cut/contextmenu
 * stay blocked app-wide. The invisible watermark overlay rides on top.
 */

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_HIGHLIGHT_COLOR = '#fde047';
const DEFAULT_PEN_COLOR = '#111827';
const DEFAULT_PEN_WIDTH = 2.5;
interface PageDim { width: number; height: number }

interface ActiveStroke {
  pageNumber: number;
  points: NormalizedPoint[];
  color: string;
  widthPx: number;
}

export function PdfPlayer({ assetId, pagesCount, watermark, testId }: PdfPlayerProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docStatus, setDocStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadToken, setReloadToken] = useState(0);
  const [dims, setDims] = useState<PageDim[] | null>(null);
  const [fitScale, setFitScale] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [tool, setTool] = useState<PdfTool>('pointer');
  const [highlightColor, setHighlightColor] = useState<string>(DEFAULT_HIGHLIGHT_COLOR);
  const [penColor, setPenColor] = useState<string>(DEFAULT_PEN_COLOR);
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_PEN_WIDTH);
  const [activeStroke, setActiveStroke] = useState<ActiveStroke | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<Map<number, HTMLElement>>(new Map());
  const visibleRef = useRef<Set<number>>(new Set());
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const strokePointsRef = useRef<NormalizedPoint[]>([]);
  const strokeMetaRef = useRef<{ pageNumber: number; color: string; widthPx: number } | null>(null);
  const strokeRafRef = useRef(0);

  const { annotations, upsert, saving } = usePdfAnnotations(assetId);

  /* ---- Document load: same-origin blob via apiClient (auth plumbing reused;
          the storage presigned URL is not CORS-fetchable, the /content proxy
          is the designed in-app reader channel). ---- */
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    setDocStatus('loading');
    setDoc(null);
    setDims(null);
    pagesRef.current = new Map();
    visibleRef.current = new Set();
    (async () => {
      try {
        const blob = await libraryApi.getContentBlob(assetId);
        const buffer = await blob.arrayBuffer();
        // data: transfers the buffer to the pdf.js worker — single-use by design.
        const loadingTask = getDocument({ data: new Uint8Array(buffer) });
        task = loadingTask;
        const loaded = await loadingTask.promise;
        if (cancelled) { void loadingTask.destroy(); return; }
        docRef.current = loaded;
        setDoc(loaded);
        setDocStatus('ready');
      } catch {
        if (!cancelled) setDocStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
      docRef.current = null;
    };
  }, [assetId, reloadToken]);

  /* ---- Page dimensions (scale-1 viewports; metadata only, no rendering). ---- */
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const numbers = Array.from({ length: doc.numPages }, (_, i) => i + 1);
      const all = await Promise.all(numbers.map(async (n) => {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        return { width: viewport.width, height: viewport.height };
      }));
      if (!cancelled) setDims(all);
    })();
    return () => { cancelled = true; };
  }, [doc]);

  /* ---- Fit-width scale: ResizeObserver on the measured content column.
          Runs after the layout that hosts contentRef (gate below only needs
          doc+dims — the ref must exist by the time this effect fires). ---- */
  useEffect(() => {
    if (!dims || dims.length === 0) return;
    const el = contentRef.current;
    if (!el) return;
    const compute = () => {
      const available = el.clientWidth;
      if (available > 0) setFitScale(available / dims[0].width);
    };
    compute();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dims]);

  /* ---- Visibility: one IntersectionObserver over the registered pages.
          Re-runs when fitScale lands (pages mount only after it). ---- */
  useEffect(() => {
    if (!doc || !dims || fitScale === null) return;
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (!pageNumber) continue;
        if (entry.isIntersecting) visibleRef.current.add(pageNumber);
        else visibleRef.current.delete(pageNumber);
      }
      setVisiblePages(new Set(visibleRef.current));
    }, { root, rootMargin: '240px 0px' });
    pagesRef.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [doc, dims, fitScale]);

  /* ---- Current page from the scroll position (closest to the midline). ---- */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !dims) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rootRect = root.getBoundingClientRect();
      const midline = rootRect.top + rootRect.height / 2;
      let best = 1;
      let bestDistance = Number.POSITIVE_INFINITY;
      pagesRef.current.forEach((el, pageNumber) => {
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - midline);
        if (distance < bestDistance) { bestDistance = distance; best = pageNumber; }
      });
      setCurrentPage(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [dims]);

  /* ---- Highlighter: commit the live selection when the tool engages. ---- */
  const commitSelection = useCallback((pageNumber: number) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const pageEl = pagesRef.current.get(pageNumber);
    if (!pageEl) return;
    const rects = rectsFromRange(selection.getRangeAt(0), pageEl.getBoundingClientRect());
    if (rects.length === 0) return;
    const textSnippet = selection.toString().replace(/\s+/g, ' ').trim().slice(0, 200) || undefined;
    upsert({
      id: newAnnotationId(),
      pageNumber,
      annotationType: 'Highlight',
      payload: { rects, color: highlightColor, textSnippet },
    });
    selection.removeAllRanges();
  }, [highlightColor, upsert]);

  useEffect(() => {
    if (tool !== 'highlighter') return;
    // Tool engaged while a selection already exists (mobile: select, then pick
    // the tool) — commit immediately against the page holding the selection.
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const anchor = selection.anchorNode;
    pagesRef.current.forEach((el, pageNumber) => {
      if (anchor && el.contains(anchor)) commitSelection(pageNumber);
    });
  }, [tool, commitSelection]);

  /* ---- Pen: pointer plumbing lives in the page view; the stroke buffer here. ---- */
  const beginStroke = useCallback((pageNumber: number, point: NormalizedPoint, pageWidthPx: number) => {
    strokePointsRef.current = [point];
    strokeMetaRef.current = { pageNumber, color: penColor, widthPx: penWidth };
    setActiveStroke({ pageNumber, points: [point], color: penColor, widthPx: penWidth * pageWidthPx });
  }, [penColor, penWidth]);

  const extendStroke = useCallback((points: NormalizedPoint[]) => {
    strokePointsRef.current = strokePointsRef.current.concat(points);
    if (strokeRafRef.current) return;
    strokeRafRef.current = requestAnimationFrame(() => {
      strokeRafRef.current = 0;
      const meta = strokeMetaRef.current;
      if (!meta) return;
      setActiveStroke({ pageNumber: meta.pageNumber, points: [...strokePointsRef.current], color: meta.color, widthPx: meta.widthPx });
    });
  }, []);

  const endStroke = useCallback((pageWidthPx: number) => {
    if (strokeRafRef.current) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current = 0; }
    const meta = strokeMetaRef.current;
    const raw = strokePointsRef.current;
    strokeMetaRef.current = null;
    setActiveStroke(null);
    strokePointsRef.current = [];
    if (!meta || raw.length === 0) return;
    // Store width normalized to the page width; points stay page-normalized.
    const annotation: PdfAnnotation = {
      id: newAnnotationId(),
      pageNumber: meta.pageNumber,
      annotationType: 'Ink',
      payload: { points: simplifyPoints(raw), color: meta.color, width: meta.widthPx / pageWidthPx },
    };
    upsert(annotation);
  }, [upsert]);

  const cancelStroke = useCallback(() => {
    if (strokeRafRef.current) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current = 0; }
    strokeMetaRef.current = null;
    setActiveStroke(null);
    strokePointsRef.current = [];
  }, []);

  /* ---- Navigation / zoom callbacks ---- */
  const goToPage = useCallback((target: number) => {
    const clamped = Math.max(1, Math.min(dims?.length ?? 1, target));
    pagesRef.current.get(clamped)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [dims]);

  const renderScale = fitScale !== null ? fitScale * (ZOOM_STEPS[zoomIndex] ?? 1) : null;
  const zoomPercent = (ZOOM_STEPS[zoomIndex] ?? 1) * 100;

  const pageCount = doc?.numPages ?? pagesCount ?? 0;

  if (docStatus === 'error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4" data-testid="pdf-player-error">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-9 w-9 text-red-300" />
        </div>
        <p className="font-bold text-white">تعذّر تحميل ملف PDF</p>
        <button
          type="button"
          onClick={() => setReloadToken((token) => token + 1)}
          className="press inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/10"
        >
          <RotateCcw className="h-4 w-4" /> إعادة المحاولة
        </button>
      </div>
    );
  }

  if (docStatus === 'loading' || !doc || !dims || dims.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center" data-testid="pdf-player-loading">
        <div className="flex flex-col items-center gap-4">
          <LoaderCircle className="h-12 w-12 animate-spin text-teal-300/80" strokeWidth={1.5} />
          <p className="text-sm font-medium text-slate-300">جارٍ تجهيز ملف PDF…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3" data-testid={testId ?? 'pdf-player'}>
      <PdfControlsBar
        tool={tool}
        onToolChange={setTool}
        highlightColor={highlightColor}
        onHighlightColorChange={setHighlightColor}
        penColor={penColor}
        onPenColorChange={setPenColor}
        penWidth={penWidth}
        onPenWidthChange={setPenWidth}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={goToPage}
        onPrevPage={() => goToPage(currentPage - 1)}
        onNextPage={() => goToPage(currentPage + 1)}
        zoomPercent={zoomPercent}
        onZoomIn={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
        onZoomOut={() => setZoomIndex((i) => Math.max(0, i - 1))}
        onZoomFit={() => setZoomIndex(0)}
        canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
        canZoomOut={zoomIndex > 0}
        saving={saving}
      />

      <div
        ref={scrollRef}
        data-testid="pdf-scroll"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-3xl bg-[#cbd5e1] px-3 py-4 sm:px-6"
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        <div ref={contentRef} className="mx-auto w-full max-w-4xl">
          {fitScale !== null && renderScale !== null && dims.map((dim, index) => {
            const pageNumber = index + 1;
            const cssWidth = dim.width * renderScale;
            const cssHeight = dim.height * renderScale;
            const pageAnnotations: PdfAnnotation[] = [];
            annotations.forEach((a) => { if (a.pageNumber === pageNumber) pageAnnotations.push(a); });
            return (
              <PageView
                key={pageNumber}
                pageNumber={pageNumber}
                cssWidth={cssWidth}
                cssHeight={cssHeight}
                renderScale={renderScale}
                doc={doc}
                visible={visiblePages.has(pageNumber)}
                annotations={pageAnnotations}
                activeStroke={activeStroke?.pageNumber === pageNumber ? activeStroke : null}
                tool={tool}
                registerPage={(el) => {
                  if (el) pagesRef.current.set(pageNumber, el);
                  else pagesRef.current.delete(pageNumber);
                }}
                onTextPointerUp={tool === 'highlighter' ? () => commitSelection(pageNumber) : undefined}
                onStrokeStart={(point) => beginStroke(pageNumber, point, cssWidth)}
                onStrokeExtend={extendStroke}
                onStrokeEnd={() => endStroke(cssWidth)}
                onStrokeCancel={cancelStroke}
              />
            );
          })}
        </div>
      </div>

      {/* Invisible watermark layer — silent protection (mirrors DocumentViewer). */}
      {watermark && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            backgroundImage: 'linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.02) 50%, transparent 60%)',
            backgroundSize: '300px 300px',
          }}
        >
          <div className="absolute whitespace-nowrap text-2xl font-bold text-white opacity-[0.05]" style={{ top: '18%', left: '8%', transform: 'rotate(-45deg)' }}>
            {watermark.studentName} - {watermark.studentPhone}
          </div>
          <div className="absolute whitespace-nowrap text-2xl font-bold text-white opacity-[0.05]" style={{ top: '58%', left: '28%', transform: 'rotate(-45deg)' }}>
            {watermark.siteName} - {watermark.timestamp}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Per-page view: canvas + text layer + annotation SVG ===== */

interface PageViewProps {
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  renderScale: number;
  doc: PDFDocumentProxy;
  visible: boolean;
  annotations: PdfAnnotation[];
  activeStroke: ActiveStroke | null;
  tool: PdfTool;
  registerPage: (el: HTMLElement | null) => void;
  onTextPointerUp?: () => void;
  onStrokeStart: (point: NormalizedPoint) => void;
  onStrokeExtend: (points: NormalizedPoint[]) => void;
  onStrokeEnd: () => void;
  onStrokeCancel: () => void;
}

function PageView({
  pageNumber, cssWidth, cssHeight, renderScale, doc, visible,
  annotations, activeStroke, tool, registerPage, onTextPointerUp,
  onStrokeStart, onStrokeExtend, onStrokeEnd, onStrokeCancel,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [pageReady, setPageReady] = useState(false);

  // Canvas + text layer render whenever the page becomes visible or the
  // scale changes; cleanup cancels in-flight render tasks and frees pixels.
  useEffect(() => {
    if (!visible || !pageReady) return;
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: renderScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext('2d');
        if (!context) return;
        const task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTask = task;
        await task.promise;
        if (cancelled) return;
        // Text layer AFTER the paint so selection never lands on a blank page.
        layer.textContent = '';
        const textLayer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: layer,
          viewport,
        });
        await textLayer.render();
      } catch (renderError) {
        // Cancellations (zoom/scroll teardown) are routine; anything else is a
        // real render failure and must be observable in the console.
        const name = (renderError as { name?: string } | null)?.name;
        if (name !== 'RenderingCancelledException') {
          console.warn('[PdfPlayer] page render/text-layer failed:', renderError);
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      canvas.width = 0;
      canvas.height = 0;
      layer.textContent = '';
    };
  }, [visible, pageReady, renderScale, pageNumber, doc]);

  // The pdf.js getPage call needs the page proxy before the first render —
  // resolve readiness once per (doc, pageNumber).
  useEffect(() => {
    let cancelled = false;
    doc.getPage(pageNumber).then(() => { if (!cancelled) setPageReady(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [doc, pageNumber]);

  const toNormalized = useCallback((clientX: number, clientY: number): NormalizedPoint => {
    const overlay = overlayRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'pen') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onStrokeStart(toNormalized(event.clientX, event.clientY));
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'pen' || !activeStroke) return;
    const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const sources = coalesced.length > 0 ? coalesced : [native];
    onStrokeExtend(sources.map((e) => toNormalized(e.clientX, e.clientY)));
  };

  const handlePointerUp = () => {
    if (tool !== 'pen' || !activeStroke) return;
    onStrokeEnd();
  };

  const drawingSurface = tool === 'pen';

  return (
    <div
      ref={registerPage}
      data-page-number={pageNumber}
      data-testid={`pdf-page-${pageNumber}`}
      className="pdf-page mb-4"
      style={{ width: Math.round(cssWidth), height: Math.round(cssHeight) }}
    >
      <canvas ref={canvasRef} aria-label={`صفحة ${pageNumber}`} />

      <div
        ref={layerRef}
        className="pdf-text-layer"
        data-pdf-text-layer="true"
        onPointerUp={onTextPointerUp}
      />

      <svg
        ref={overlayRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className={`pdf-annotation-layer${drawingSurface ? ' is-drawing-surface' : ''}`}
        data-annotation-page={pageNumber}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={onStrokeCancel}
      >
        {annotations.map((annotation) => {
          if (annotation.annotationType === 'Highlight') {
            return (
              <g key={annotation.id} className="pdf-highlight">
                {annotation.payload.rects.map((rect, index) => (
                  <rect key={index} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={annotation.payload.color} />
                ))}
              </g>
            );
          }
          return (
            <path
              key={annotation.id}
              className="pdf-ink"
              d={strokePathD(annotation.payload.points)}
              stroke={annotation.payload.color}
              strokeWidth={annotation.payload.width * cssWidth}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {activeStroke && (
          <path
            className="pdf-ink"
            d={strokePathD(activeStroke.points)}
            stroke={activeStroke.color}
            strokeWidth={activeStroke.widthPx}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}

export default PdfPlayer;
