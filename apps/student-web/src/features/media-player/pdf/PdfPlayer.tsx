import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { libraryApi } from '@/features/library/services/library-api';
import { usePdfAnnotations } from './usePdfAnnotations';
import { PdfControlsBar } from './PdfControlsBar';
import { ensurePdfWorker } from './pdf-worker';
import { normalizeArabicPresentationForms } from './pdf-text';
import { PDF_DEBUG, textLayerDebugClass } from './pdf-debug';
import { clamp01, newAnnotationId, rectsFromRange, resolveInkStrokeWidth, simplifyPoints, strokePathD } from './pdf-geometry';
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
 *
 * Hotfix R16 (production feedback): R16.1 self-hosted pdf.js cmap/font/wasm
 * assets + system-font fallback (canvas Arabic); R16.2/16.3 overlay strictly
 * coextensive with the canvas + official span/br text-layer contract
 * (highlight offset / bottom-of-page coverage); R16.4 ink strokeWidth as a
 * page-relative fraction (no raw px, no vector-effect, legacy-payload guard).
 *
 * Hotfix R18 (production feedback): R18.1 bullet-proof text-layer invisibility
 * (!important color/shadow/background transparency — the double-render leak
 * behind the "W ebS o ck et" screenshot) + URL diagnostics (pdf-debug.ts:
 * ?pdfDebugText=hide|visible, ?pdfFonts=system). R18.2 the highlight surface
 * is its OWN blend layer under the text layer — z 0 canvas < 10 highlight
 * (multiply wash) < 11 ink < 20 text — because mix-blend-mode on a child of
 * the isolated ink SVG could never reach the canvas and painted as an opaque
 * block over the glyphs.
 */

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_HIGHLIGHT_COLOR = '#fde047';
const DEFAULT_PEN_COLOR = '#111827';
const DEFAULT_PEN_WIDTH = 2.5;

/* Hotfix R16.1 — pdf.js runtime assets, self-hosted from public/ (copied from
 * node_modules/pdfjs-dist at the pinned version; BASE_URL keeps it correct
 * under any deploy base path). cMaps map character codes to Unicode for
 * CID-keyed/embedded-encoding fonts (the Arabic isolated-glyph report on the
 * CANVAS), standard_fonts cover the base-14 fallbacks, wasm covers JBIG2 /
 * JPEG2000 / ICC image paths, and useSystemFonts lets non-embedded fonts
 * fall back to system shaping fonts instead of isolated glyphs. */
const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs-dist/`;
interface PageDim { width: number; height: number }

/** Stable empty list so memoized pages never see a fresh array identity. */
const EMPTY_PAGE_ANNOTATIONS: PdfAnnotation[] = [];

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

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<Map<number, HTMLElement>>(new Map());
  const visibleRef = useRef<Set<number>>(new Set());
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const { annotations, upsert, saving } = usePdfAnnotations(assetId);

  /* ---- Page-scoped annotation lists (hotfix R15.3): one memoized Map, so
          memoized PageViews receive stable array identities across renders
          that don't touch annotations (scroll, tool switches, pen commits). ---- */
  const annotationsByPage = useMemo(() => {
    const map = new Map<number, PdfAnnotation[]>();
    for (const annotation of annotations.values()) {
      const list = map.get(annotation.pageNumber);
      if (list) list.push(annotation);
      else map.set(annotation.pageNumber, [annotation]);
    }
    return map;
  }, [annotations]);

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
        // Hotfix R16.1: font/cmap resource URLs + system-font fallback (see
        // PDFJS_ASSET_BASE above) — without them pdf.js cannot resolve CID
        // mappings or base-14 fallbacks and the canvas bakes isolated letters.
        const loadingTask = getDocument({
          data: new Uint8Array(buffer),
          cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
          wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
          iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
          useSystemFonts: true,
          // Hotfix R18.1 (?pdfFonts=system): bypass the browser @font-face
          // registration — pdf.js draws glyph outlines as paths straight from
          // the embedded font programs instead of filling text through a
          // synthetic-cmap webfont (the canvas glyph-mapping failure mode:
          // dropped 'i's, 'a'→'ã', inter-cluster gaps — see R18 e2e S1/S6).
          ...(PDF_DEBUG.systemFontsOnly ? { disableFontFace: true } : {}),
        });
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
    // Hotfix R15.2: the CANVAS is the single geometry authority. Selection
    // rects are normalized against its box — the overlay SVG and the page div
    // are kept pixel-identical to it (same rounding, inset 0) — so highlight
    // coordinates can never drift off the glyphs the user actually selected.
    const canvas = pageEl.querySelector(':scope > canvas');
    const surface = (canvas ?? pageEl).getBoundingClientRect();
    const rects = rectsFromRange(selection.getRangeAt(0), surface);
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

  /* ---- Pen (hotfix R15.3): the stroke buffer and its live rendering live in
          the PageView (refs + direct DOM), so pointermove NEVER touches React
          state — the parent sees exactly one call per completed stroke. ---- */
  const registerPage = useCallback((pageNumber: number, el: HTMLElement | null) => {
    if (el) pagesRef.current.set(pageNumber, el);
    else pagesRef.current.delete(pageNumber);
  }, []);

  const commitInk = useCallback((pageNumber: number, points: NormalizedPoint[], pageWidthPx: number) => {
    if (points.length === 0) return;
    // Width is stored normalized to the page width; points stay page-normalized.
    upsert({
      id: newAnnotationId(),
      pageNumber,
      annotationType: 'Ink',
      payload: { points: simplifyPoints(points), color: penColor, width: penWidth / pageWidthPx },
    });
  }, [upsert, penColor, penWidth]);

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
            return (
              <PageView
                key={pageNumber}
                pageNumber={pageNumber}
                cssWidth={cssWidth}
                cssHeight={cssHeight}
                renderScale={renderScale}
                doc={doc}
                visible={visiblePages.has(pageNumber)}
                annotations={annotationsByPage.get(pageNumber) ?? EMPTY_PAGE_ANNOTATIONS}
                tool={tool}
                penColor={penColor}
                penWidth={penWidth}
                registerPage={registerPage}
                onTextPointerUp={tool === 'highlighter' ? commitSelection : undefined}
                onStrokeCommit={commitInk}
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
  tool: PdfTool;
  penColor: string;
  penWidth: number;
  registerPage: (pageNumber: number, el: HTMLElement | null) => void;
  onTextPointerUp?: (pageNumber: number) => void;
  onStrokeCommit: (pageNumber: number, points: NormalizedPoint[], pageWidthPx: number) => void;
}

/** Hotfix R15.3 — memoized: every prop is a primitive, a stable callback, or a
 *  reference that only changes when content actually changes, so unrelated
 *  renders (scroll, saves on other pages) never re-render this page's canvas
 *  or text layer. */
const PageView = memo(function PageView({
  pageNumber, cssWidth, cssHeight, renderScale, doc, visible,
  annotations, tool, penColor, penWidth, registerPage, onTextPointerUp, onStrokeCommit,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [pageReady, setPageReady] = useState(false);

  // Hotfix R15.3 — the active stroke lives in refs, never in React state:
  // pointermove appends to the buffer and repaints ONE <path> via its d
  // attribute (rAF-throttled); React state is touched exactly once, on
  // pointerup, through onStrokeCommit. The per-move whole-player re-render
  // that made the screen flicker while drawing is gone.
  const strokeRef = useRef<{ points: NormalizedPoint[]; color: string; width: number } | null>(null);
  const livePathRef = useRef<SVGPathElement | null>(null);
  const strokeRafRef = useRef(0);

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
        // Hotfix R15.2: round the CSS box the same way the page div does —
        // canvas, page box and overlay SVG must be pixel-identical surfaces.
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;
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
        // Hotfix R15.1: the content is materialized through presentation-form
        // normalization first — Arabic spans then carry BASE letters (shapable,
        // joinable) instead of the fixed isolated glyphs the PDF's ToUnicode
        // map emitted; the stylesheet's unicode-bidi: plaintext does the rest.
        layer.textContent = '';
        const textContent = await page.getTextContent();
        const items = textContent.items.map((item) => ('str' in item
          ? { ...item, str: normalizeArabicPresentationForms(item.str) }
          : item));
        const textLayer = new TextLayer({
          textContentSource: { lang: textContent.lang, items, styles: textContent.styles },
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

  const setPageRef = useCallback(
    (el: HTMLElement | null) => registerPage(pageNumber, el),
    [registerPage, pageNumber],
  );

  const toNormalized = useCallback((clientX: number, clientY: number): NormalizedPoint => {
    const overlay = overlayRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
  }, []);

  const paintLiveStroke = useCallback(() => {
    if (strokeRafRef.current) return;
    strokeRafRef.current = requestAnimationFrame(() => {
      strokeRafRef.current = 0;
      const live = livePathRef.current;
      const stroke = strokeRef.current;
      if (live && stroke && stroke.points.length > 0) {
        live.setAttribute('d', strokePathD(stroke.points));
      }
    });
  }, []);

  const clearLiveStroke = useCallback(() => {
    if (strokeRafRef.current) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current = 0; }
    livePathRef.current?.remove();
    livePathRef.current = null;
    strokeRef.current = null;
  }, []);

  // Teardown if the page unmounts mid-stroke (zoom/visibility flip).
  useEffect(() => clearLiveStroke, [clearLiveStroke]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'pen') return;
    const svg = overlayRef.current;
    if (!svg) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toNormalized(event.clientX, event.clientY);
    strokeRef.current = { points: [point], color: penColor, width: penWidth };
    // Live path is created imperatively with the SAME geometry contract as
    // committed ink (hotfix R16.4): stroke width is the page-relative FRACTION
    // penWidth / pageWidth against the unit viewBox. The pre-R15.3 code fed
    // React a per-move state update AND a strokeWidth of penWidth * pageWidth
    // (≈2000 with non-scaling-stroke) — a screen-sized flash on every stroke;
    // the R15.3 refactor swapped it to raw screen px, which still relies on
    // vector-effect surviving the browser. A fraction is intrinsically safe:
    // the worst units mistake renders ≤10% of the page, never a 2000px blob.
    const overlayBox = svg.getBoundingClientRect();
    const pageWidthPx = overlayBox.width > 0 ? overlayBox.width : cssWidth;
    const live = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    live.setAttribute('class', 'pdf-ink');
    live.setAttribute('stroke', penColor);
    live.setAttribute('stroke-width', String(penWidth / pageWidthPx));
    live.setAttribute('d', strokePathD([point]));
    svg.appendChild(live);
    livePathRef.current = live;
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'pen' || !strokeRef.current) return;
    const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const sources = coalesced.length > 0 ? coalesced : [native];
    for (const source of sources) {
      strokeRef.current.points.push(toNormalized(source.clientX, source.clientY));
    }
    paintLiveStroke();
  };

  const handlePointerUp = () => {
    if (tool !== 'pen' || !strokeRef.current) return;
    const stroke = strokeRef.current;
    if (strokeRafRef.current) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current = 0; }
    livePathRef.current?.setAttribute('d', strokePathD(stroke.points));
    clearLiveStroke();
    onStrokeCommit(pageNumber, stroke.points, cssWidth);
  };

  const drawingSurface = tool === 'pen';

  return (
    <div
      ref={setPageRef}
      data-page-number={pageNumber}
      data-testid={`pdf-page-${pageNumber}`}
      className="pdf-page mb-4"
      /* --total-scale-factor feeds the pdf.js v6 span metric contract the text
         layer CSS mirrors (hotfix R15.1): font-size = scale * --font-height. */
      style={{
        width: Math.round(cssWidth),
        height: Math.round(cssHeight),
        '--total-scale-factor': renderScale,
      } as React.CSSProperties}
    >
      <canvas ref={canvasRef} aria-label={`صفحة ${pageNumber}`} />

      {/* Hotfix R18.2 — highlights live on their OWN blend surface. mix-blend-
          mode composites an element against its backdrop, but blending stops
          at the nearest stacking context: inside the (z-indexed, therefore
          isolated) ink SVG a multiplied child can only blend with the SVG's
          transparent backdrop — the production "opaque yellow covering the
          text". As a sibling SVG the ROOT carries the blend and multiplies
          straight through onto the canvas below (z 10 < 20 text layer). */}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pdf-highlight-layer"
        data-annotation-page={pageNumber}
        data-testid={`pdf-highlight-layer-${pageNumber}`}
        aria-hidden="true"
      >
        {annotations.map((annotation) => {
          if (annotation.annotationType !== 'Highlight') return null;
          return (
            <g key={annotation.id} className="pdf-highlight">
              {annotation.payload.rects.map((rect, index) => (
                <rect key={index} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={annotation.payload.color} />
              ))}
            </g>
          );
        })}
      </svg>

      <svg
        ref={overlayRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className={`pdf-annotation-layer${drawingSurface ? ' is-drawing-surface' : ''}`}
        data-annotation-page={pageNumber}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={clearLiveStroke}
      >
        {annotations.map((annotation) => {
          if (annotation.annotationType !== 'Ink') return null;
          return (
            <path
              key={annotation.id}
              className="pdf-ink"
              d={strokePathD(annotation.payload.points)}
              stroke={annotation.payload.color}
              /* Hotfix R16.4: page-relative fraction against the unit viewBox
                 (see resolveInkStrokeWidth) — no raw px, no vector-effect. */
              strokeWidth={resolveInkStrokeWidth(annotation.payload.width, cssWidth)}
            />
          );
        })}
      </svg>

      <div
        ref={layerRef}
        className={`pdf-text-layer${tool === 'pen' ? ' is-dormant' : ''}${textLayerDebugClass()}`}
        data-pdf-text-layer="true"
        onPointerUp={onTextPointerUp ? () => onTextPointerUp(pageNumber) : undefined}
      />
    </div>
  );
});

export default PdfPlayer;
