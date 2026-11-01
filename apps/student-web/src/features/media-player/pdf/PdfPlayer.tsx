import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getDocument, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AlertTriangle, Focus, LoaderCircle, RotateCcw } from 'lucide-react';
import { libraryApi } from '@/features/library/services/library-api';
import { toast } from 'sonner';
import { usePdfAnnotations } from './usePdfAnnotations';
import { MobileActionBar } from './MobileActionBar';
import { PdfControlsBar } from './PdfControlsBar';
import { ensurePdfWorker } from './pdf-worker';
import { normalizeArabicPresentationForms } from './pdf-text';
import { PDF_DEBUG, textLayerDebugClass } from './pdf-debug';
import {
  arrowHeadPoints, clamp01, collectEraserHitIds, hitTestShape, isDegenerateArrow, isDegenerateBox, newAnnotationId,
  normalizeBox, polygonPointsAttr, rectsFromRange, resolveInkStrokeWidth, simplifyPoints,
  starPolygonPoints, strokePathD,
} from './pdf-geometry';
import { NoteLayer } from './pdf-note-layer';
import { PdfSearchPanel } from './pdf-search-panel';
import { PdfStatusBar } from './PdfStatusBar';
import { StudyListsPanel } from './StudyListsPanel';
import { StudyToolsPanel } from './StudyToolsPanel';
import { ThumbnailsRail } from './ThumbnailsRail';
import { usePlayerShell } from '../shell-context';
import { collectHighlights, collectNotes, type StudyListKind } from './study-lists';
import { addBookmark, isBookmarked, loadBookmarks, removeBookmark, type PageBookmark } from './pdf-bookmarks';
import {
  documentSearchCacheKey, findMatches, getCachedPageSearchItems, getCachedPageSearchSourceIndexes,
  getCachedPageSearchViewport, getPageSearchItems, matchFallbackBoxes,
  type SearchHitBox, type SearchMatch,
} from './pdf-search';
import { createSearchSpanMap, createSearchResolveStats, resolveSearchMatchRects, type SearchResolveStats } from './pdf-search-dom';
import type {
  NormalizedPoint, NormalizedRect, NoteAnnotation, PdfAnnotation, PdfPlayerProps, PdfTool, ShapeKind,
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
 * ?pdfDebugText=hide|visible). R18.2 the highlight surface is its OWN blend
 * layer under the text layer — z 0 canvas < 10 highlight (multiply wash) <
 * 11 ink < 20 text — because mix-blend-mode on a child of the isolated ink
 * SVG could never reach the canvas and painted as an opaque block over the
 * glyphs.
 *
 * Hotfix R19 (production feedback): the A/B evidence (R18 e2e S1 vs S6)
 * proved the browser @font-face pipeline mis-maps the synthetic cmap of
 * subset embedded fonts on the canvas (dropped 'i's, 'a'→'ã', cluster gaps —
 * the "W ebS o ck et" signature). Path rendering is therefore the DEFAULT:
 * disableFontFace: true — pdf.js draws glyph outlines as paths straight from
 * the embedded font programs. cMap/cMapPacked stay on (character mapping),
 * useSystemFonts stays on (non-embedded fallbacks). Field A/B of the old
 * pipeline: ?pdfFonts=embedded (pdf-debug.ts).
 *
 * Wave 11.9: files the server-side Ghostscript pipeline re-embedded
 * (LibraryFileDto.FontPipelineFixed — the "{key}-fixed" object with healthy
 * fonts) were initially SAFE for the standard @font-face pipeline, and the
 * player flipped to disableFontFace: false for exactly those files.
 *
 * R22 (production feedback, approved phased strategy): some Word-generated
 * PDFs carry pre-shaped/broken text streams that Ghostscript cannot fully
 * repair — field evidence showed the @font-face pipeline still mis-maps them.
 * Path rendering is therefore UNIVERSAL again: disableFontFace: true for EVERY
 * file, regardless of FontPipelineFixed (the flag stays on the wire for
 * audit/observability only). Ghostscript keeps running server-side — it
 * embeds/substitutes fonts (the diagnostics report feeds the admin support
 * view) — but the canvas always draws glyph outlines as paths. The only
 * escape hatch remains the ?pdfFonts=embedded diagnostic override
 * (pdf-debug.ts).
 *
 * Wave 11.10 (F2 Phase 2): 'shape' (rect/ellipse/arrow/star — committed into
 * the SAME z-11 SVG as ink, unit-viewBox fraction strokes, arrowheads computed
 * in pixel space so the non-uniform viewBox cannot shear them) and 'note'
 * (sticky notes — a DOM layer at z 25 ABOVE the text layer; the container
 * never takes the pointer, icons/editor opt back in, so text selection keeps
 * working). Shape selection in pointer mode is a pure geometry hit test (the
 * text layer owns real pointer events per R18); Delete/Backspace or the
 * toolbar trash removes the selection. All geometry stays page-normalized 0..1
 * and persists through the SAME batch upsert contract — no backend changes
 * beyond the enum members Shape=2 / Note=3.
 */

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_HIGHLIGHT_COLOR = '#fde047';
const DEFAULT_PEN_COLOR = '#111827';
const DEFAULT_PEN_WIDTH = 2.5;

/* Wave 11.10 — shapes/notes defaults. Shape strokes reuse the R16.4 ink width
 * contract: the committed strokeWidth is SHAPE_STROKE_PX ÷ live page width, a
 * page-relative fraction against the unit viewBox (never raw px). */
const DEFAULT_SHAPE_COLOR = '#dc2626';
const DEFAULT_NOTE_COLOR = '#fde047';
const SHAPE_STROKE_PX = 3;
const ARROW_HEAD_LENGTH_PX = 14;
const ARROW_HEAD_HALF_WIDTH_PX = 5;

/* Wave 11.11 — smart eraser: the tip is a fixed-px circle, normalized against
 * the live page width (the same fraction contract as the ink/shape strokes). */
const ERASER_RADIUS_PX = 12;

/* Hotfix R16.1 — pdf.js runtime assets, self-hosted from public/ (copied from
 * node_modules/pdfjs-dist at the pinned version; BASE_URL keeps it correct
 * under any deploy base path). cMaps map character codes to Unicode for
 * CID-keyed/embedded-encoding fonts (the Arabic isolated-glyph report on the
 * CANVAS), standard_fonts cover the base-14 fallbacks, wasm covers JBIG2 /
 * JPEG2000 / ICC image paths, and useSystemFonts lets non-embedded fonts
 * fall back to system shaping fonts instead of isolated glyphs. */
const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs-dist/`;

/* Wave 11.11-C — scanned pages are a FINAL state for now (OCR is Wave 13):
 * the highlighter and search depend entirely on a text layer, so they are
 * disabled — never hidden — with an explanatory tooltip on scanned pages. */
const SCANNED_PAGE_TOOLTIP = 'هذه الصفحة ممسوحة ضوئياً — لا توجد طبقة نصية';

interface PageDim { width: number; height: number }

/** Stable empty list so memoized pages never see a fresh array identity. */
const EMPTY_PAGE_ANNOTATIONS: PdfAnnotation[] = [];
/** Stable empty search-hit list (same memo-identity contract). */
const EMPTY_SEARCH_HITS: SearchHitBox[] = [];
/** Stable empty per-page match list (same memo-identity contract). */
const EMPTY_SEARCH_MATCHES: SearchMatch[] = [];

/* Wave 12.3.A (A.5) — the Tailwind `lg` breakpoint as a media query: focus
 * mode's tap-to-reveal chrome contract is MOBILE-only (supervisor locked);
 * desktop keeps the always-visible exit pill from 12.2.C.5. */
const COMPACT_QUERY = '(max-width: 1023.98px)';
const FOCUS_REVEAL_MS = 3000;

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', notify);
    return () => mql.removeEventListener('change', notify);
  }, [query]);
  const getSnapshot = useCallback(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  ), [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Wave 12.3.C — the first 30 chars of a page's CACHED search text (the
 *  bookmark-row snippet; null when the page was never extracted — "if
 *  available" per the locked spec; no extra pdf.js extraction). */
function getPageSnippet(doc: PDFDocumentProxy | null, page: number): string | null {
  if (!doc) return null;
  const items = getCachedPageSearchItems(doc, page);
  if (!items || items.length === 0) return null;
  const text = items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text.slice(0, 30) : null;
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
  /* Wave 11.10 — shape/note tool state + selection. */
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect');
  const [shapeColor, setShapeColor] = useState<string>(DEFAULT_SHAPE_COLOR);
  const [noteColor, setNoteColor] = useState<string>(DEFAULT_NOTE_COLOR);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  /* Wave 11.11 — text search (B): ENTIRELY transient state — never persisted,
   * never broadcast; the sweep is cancellable via a token, current page first,
   * then the rest ascending. */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [searchProgress, setSearchProgress] = useState<{ done: number; total: number } | null>(null);
  const searchSweepTokenRef = useRef(0);
  /* Wave 12.1 — the sweep token as state: PageView's DOM resolver keys its
   * cache by (layer build, generation), so a new query can never reuse rects
   * resolved for the previous one. */
  const [searchGeneration, setSearchGeneration] = useState(0);
  /* Wave 12.1 — char-level resolved hit rects, keyed `fingerprint:pageNumber`
   * (R12.1.b state contract). Values are per-match arrays in the page's
   * SearchMatch order; null entries = matches that fell back to the
   * proportional slice box (layer not built, or span verification failed). */
  const [resolvedHitRects, setResolvedHitRects] = useState<Record<string, Array<NormalizedRect[] | null>>>({});
  const docFingerprint = useMemo(() => (doc ? documentSearchCacheKey(doc) : ''), [doc]);

  /* ---- Wave 12.2.C.5 — focus mode: chrome collapses around the page. The
          center scroll column NEVER collapses (red line); the rails, top bar
          and status bar animate away while staying mounted.
          Wave 12.3.A (A.5) — MOBILE: ALL chrome hides (shell header, top
          bar, bottom action bar, status bar, floating pill); a tap anywhere
          reveals it for 3s, then it auto-hides again. Escape still exits
          (handler below unchanged). ---- */
  const [focusMode, setFocusMode] = useState(false);
  const toggleFocusMode = useCallback(() => setFocusMode((mode) => !mode), []);
  const [chromePeeked, setChromePeeked] = useState(false);
  const chromePeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const lastNavIndexRef = useRef(-1);
  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  /* Wave 11.11-C — per-page text-layer presence, fed by every page render.
   * Unknown (undefined) = not yet rendered → tools stay ENABLED; only an
   * explicit false (a rendered page with zero non-whitespace text items)
   * gates the text-dependent tools. */
  const [pageHasText, setPageHasText] = useState<Record<number, boolean>>({});
  const handleTextLayerState = useCallback((pageNumber: number, hasText: boolean) => {
    setPageHasText((prev) => (prev[pageNumber] === hasText ? prev : { ...prev, [pageNumber]: hasText }));
  }, []);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<Map<number, HTMLElement>>(new Map());
  const visibleRef = useRef<Set<number>>(new Set());
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const { annotations, upsert, remove, undo, redo, canUndo, canRedo, saving } = usePdfAnnotations(assetId);

  /* ---- Wave 12.3.A (A.2/A.3) — the mobile drawers are CONTROLLED here:
          the bottom action bar is their only trigger below `lg` (the old
          floating toggles were removed). ---- */
  const [thumbsDrawerOpen, setThumbsDrawerOpen] = useState(false);
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);

  /* ---- Wave 12.3.C — study lists (notes/highlights/bookmarks).
          activeList drives the StudyListsPanel (docked ≥ lg / drawer < lg).
          Bookmarks are PAGE-LEVEL, client-side ONLY — localStorage keyed by
          fileId in v1; Wave 12.4 moves them to the backend (pdf-bookmarks.ts
          is written so the port touches that module alone). flashAnnotationId
          pulses the target's nodes after a list click (1.6s, CSS animation). ---- */
  const [activeList, setActiveList] = useState<StudyListKind | null>(null);
  const [bookmarks, setBookmarks] = useState<PageBookmark[]>(() => loadBookmarks(assetId));
  useEffect(() => {
    setBookmarks(loadBookmarks(assetId));
    setActiveList(null);
  }, [assetId]);
  const openList = useCallback((kind: StudyListKind) => {
    setActiveList((current) => (current === kind ? null : kind));
    setToolsDrawerOpen(false); // the drawer hands over to the list panel
  }, []);
  const closeList = useCallback(() => setActiveList(null), []);
  const pageBookmarked = isBookmarked(assetId, currentPage);
  const toggleBookmark = useCallback(() => {
    const page = currentPageRef.current;
    if (isBookmarked(assetId, page)) {
      setBookmarks(removeBookmark(assetId, page));
      toast.info(`تمت إزالة العلامة المرجعية عن الصفحة ${page}`, { duration: 2200 });
      return;
    }
    setBookmarks(addBookmark(assetId, page, getPageSnippet(doc, page) ?? undefined));
    toast.info(`تمت إضافة علامة مرجعية للصفحة ${page}`, { duration: 2200 });
  }, [assetId, doc]);
  const [flashAnnotationId, setFlashAnnotationId] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashAnnotation = useCallback((id: string | null) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashAnnotationId(id);
    if (id) flashTimerRef.current = setTimeout(() => setFlashAnnotationId(null), 1600);
  }, []);
  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);
  /** Bookmark-row snippet: the page's cached search text, first 30 chars. */
  const snippetFor = useCallback((page: number) => getPageSnippet(doc, page), [doc]);
  const handleBookmarkRemove = useCallback((page: number) => {
    setBookmarks(removeBookmark(assetId, page));
  }, [assetId]);
  const notesList = useMemo(() => collectNotes(annotations.values()), [annotations]);
  const highlightsList = useMemo(() => collectHighlights(annotations.values()), [annotations]);

  /* ---- Wave 12.3.A (A.5) — effective chrome visibility in focus mode.
          Desktop (≥ lg): the 12.2.C.5 contract — chrome collapsed, exit
          pill always visible. Mobile (< lg): everything hides; a tap
          peeks the chrome for 3s (auto-hide timer below). ---- */
  const focusChromeHidden = focusMode && !(isCompact && chromePeeked);

  /* The SHELL header (title/badge/fullscreen/close) joins the mobile focus
   * collapse through the shell context — keep-mounted animation there too.
   * Desktop focus keeps the 12.2 header-visible contract. */
  const shell = usePlayerShell();
  useEffect(() => {
    shell?.setChromeHidden?.(focusMode && isCompact && !chromePeeked);
    return () => shell?.setChromeHidden?.(false);
  }, [shell, focusMode, isCompact, chromePeeked]);

  /* Tap-to-reveal (mobile focus): a tap on non-interactive surfaces peeks
   * the chrome for 3s. Interactive targets (buttons/inputs/notes/search)
   * keep their own semantics and never trigger the peek. */
  const handleFocusTapReveal = useCallback((event: React.MouseEvent) => {
    if (!focusMode || !isCompact) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('button, a, input, textarea, select, [contenteditable="true"], [data-pdf-note-editor], [data-pdf-search-panel]')) return;
    setChromePeeked(true);
    if (chromePeekTimerRef.current) clearTimeout(chromePeekTimerRef.current);
    chromePeekTimerRef.current = setTimeout(() => setChromePeeked(false), FOCUS_REVEAL_MS);
  }, [focusMode, isCompact]);

  // Leaving focus mode kills the peek + its timer.
  useEffect(() => {
    if (focusMode) return;
    if (chromePeekTimerRef.current) { clearTimeout(chromePeekTimerRef.current); chromePeekTimerRef.current = null; }
    setChromePeeked(false);
  }, [focusMode]);
  useEffect(() => () => {
    if (chromePeekTimerRef.current) clearTimeout(chromePeekTimerRef.current);
  }, []);

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
    setPageHasText({}); // per-page text-layer facts are per-document
    setResolvedHitRects({}); // Wave 12.1 — resolved hit rects are per-document
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
          // Hotfix R19.1 — DEFAULT path rendering (glyph outlines drawn as
          // paths straight from the embedded font programs). The @font-face
          // pipeline produces the canvas glyph-mapping failure mode (dropped
          // 'i's, 'a'→'ã', inter-cluster gaps — R18 e2e S1/S6 A/B evidence);
          // visual integrity of medical Arabic outweighs the render cost.
          // cMapUrl/cMapPacked above stay active for character mapping.
          //
          // R22 — path rendering is UNIVERSAL: the Ghostscript pass cannot
          // fully repair every Word-generated PDF (pre-shaped/broken text
          // streams), so the Wave 11.9 per-file @font-face exception is rolled
          // back. fontPipelineFixed stays on the DTO for audit only and does
          // NOT influence rendering anymore.
          disableFontFace: true,
          // Diagnostic ONLY (?pdfFonts=embedded): opt BACK into the old
          // @font-face pipeline to reproduce the broken canvas in the field.
          ...(PDF_DEBUG.embeddedFontFaceOverride ? { disableFontFace: false } : {}),
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

  /* ---- Wave 11.10 — shape commits (F2 Phase 2): box kinds store the drag
          box, the arrow stores both endpoints; degenerate taps commit nothing.
          Stroke width follows the R16.4 ink contract (fraction of page width). ---- */
  const commitShape = useCallback((pageNumber: number, kind: ShapeKind, sx: number, sy: number, ex: number, ey: number, pageWidthPx: number) => {
    const strokeWidth = SHAPE_STROKE_PX / (pageWidthPx > 0 ? pageWidthPx : 1);
    if (kind === 'arrow') {
      if (isDegenerateArrow(sx, sy, ex, ey)) return;
      upsert({
        id: newAnnotationId(),
        pageNumber,
        annotationType: 'Shape',
        payload: { shape: 'arrow', x: sx, y: sy, x1: sx, y1: sy, x2: ex, y2: ey, color: shapeColor, strokeWidth },
      });
      return;
    }
    const box = normalizeBox(sx, sy, ex, ey);
    if (isDegenerateBox(box)) return;
    upsert({
      id: newAnnotationId(),
      pageNumber,
      annotationType: 'Shape',
      payload: { shape: kind, x: box.x, y: box.y, w: box.w, h: box.h, color: shapeColor, strokeWidth },
    });
  }, [upsert, shapeColor]);

  /* ---- Wave 11.10 — sticky notes: a tap on the page (note tool) places a
          note and opens its inline editor immediately; the editor commits on
          blur/save and an EMPTY note is removed instead of persisted. ---- */
  const createNote = useCallback((pageNumber: number, clientX: number, clientY: number) => {
    const pageEl = pagesRef.current.get(pageNumber);
    if (!pageEl) return;
    const canvas = pageEl.querySelector(':scope > canvas');
    const surface = (canvas ?? pageEl).getBoundingClientRect();
    if (!(surface.width > 0) || !(surface.height > 0)) return;
    const x = clamp01((clientX - surface.left) / surface.width);
    const y = clamp01((clientY - surface.top) / surface.height);
    const note: NoteAnnotation = {
      id: newAnnotationId(),
      pageNumber,
      annotationType: 'Note',
      payload: { x, y, text: '', color: noteColor },
    };
    upsert(note);
    setSelectedShapeId(null);
    setOpenNoteId(note.id);
  }, [noteColor, upsert]);

  const commitNoteText = useCallback((note: NoteAnnotation, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      remove([note.id]);
      return;
    }
    upsert({ ...note, payload: { ...note.payload, text: trimmed } });
  }, [remove, upsert]);

  const deleteNote = useCallback((id: string) => {
    remove([id]);
    setOpenNoteId(null);
  }, [remove]);

  const closeNote = useCallback(() => setOpenNoteId(null), []);

  /* ---- Wave 11.11 — smart eraser: the PageView owns the gesture refs and the
          geometry hit test; the parent owns the store. Commit-on-up: ONE
          gesture = ONE remove() = ONE debounced batch flush (the supervisor
          locked undo unit). Erasing the selected shape clears the selection. ---- */
  const eraseAnnotations = useCallback((_pageNumber: number, ids: string[]) => {
    if (ids.length === 0) return;
    remove(ids);
    setSelectedShapeId((selected) => (selected !== null && ids.includes(selected) ? null : selected));
  }, [remove]);

  /* ---- Wave 11.10 — pointer-tool routing on the text layer: highlighter
          commits the selection; pointer mode runs the pure-geometry shape hit
          test (select / deselect). A selection DRAG (collapsed = false) is
          never treated as a shape click. ---- */
  const handleTextPointerUp = useCallback((pageNumber: number, clientX: number, clientY: number) => {
    if (tool === 'highlighter') {
      commitSelection(pageNumber);
      return;
    }
    if (tool !== 'pointer') return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const pageEl = pagesRef.current.get(pageNumber);
    if (!pageEl) return;
    const canvas = pageEl.querySelector(':scope > canvas');
    const surface = (canvas ?? pageEl).getBoundingClientRect();
    if (!(surface.width > 0) || !(surface.height > 0)) return;
    const nx = clamp01((clientX - surface.left) / surface.width);
    const ny = clamp01((clientY - surface.top) / surface.height);
    const shapes = annotationsByPage.get(pageNumber) ?? [];
    let hitId: string | null = null;
    for (let i = shapes.length - 1; i >= 0; i -= 1) {
      const shape = shapes[i];
      if (shape.annotationType === 'Shape' && hitTestShape(shape.payload, nx, ny)) {
        hitId = shape.id;
        break;
      }
    }
    setSelectedShapeId(hitId);
  }, [tool, commitSelection, annotationsByPage]);

  /* ---- Wave 11.10 — Delete/Backspace removes the selected shape; Escape
          deselects. Editable targets (inputs/textareas) never trigger it. ---- */
  useEffect(() => {
    if (!selectedShapeId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedShapeId(null);
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      remove([selectedShapeId]);
      setSelectedShapeId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedShapeId, remove]);

  /* ---- R30.2 — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y drive the annotation history.
          Editable targets (note textarea, search + page inputs) keep their
          NATIVE undo — the guard mirrors the Delete/Backspace routing above.
          macCmdKey (metaKey) included; alt is never a history chord. ---- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      if (key === 'z' && event.shiftKey) redo();
      else if (key === 'z') undo();
      else redo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  /* ---- Wave 12.2.C.5 — Escape exits focus mode; F toggles it. Editable
          targets (inputs/textareas) are guarded exactly like the history
          chords above. Escape ALSO lands in PlayerShell's onEscapeKeyDown,
          which suppresses the Radix shell dismissal while the player root
          carries [data-pdf-focus-mode] (state re-renders one tick later, so
          the attribute is still present during this very keypress). ---- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'f') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      setFocusMode((mode) => !mode);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  /* ---- Navigation / zoom callbacks ---- */
  const goToPage = useCallback((target: number) => {
    const clamped = Math.max(1, Math.min(dims?.length ?? 1, target));
    pagesRef.current.get(clamped)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [dims]);

  /* ---- Wave 12.3.C — a study-list row click: navigate + flash the target
          (note/highlight annotations pulse via .pdf-annotation-flash), then
          hand the stage back (the panel closes). Defined after goToPage. ---- */
  const handleListEntryClick = useCallback((page: number, annotationId: string | null) => {
    goToPage(page);
    if (annotationId) flashAnnotation(annotationId);
    setActiveList(null);
  }, [goToPage, flashAnnotation]);

  /* ---- Wave 11.11 — search sweep (B): debounced, cancellable, whole-doc
          lazy. Current page is searched first; the remaining pages stream in
          ascending order with a live done/total counter. ---- */
  const runSearchSweep = useCallback(async (rawQuery: string, token: number) => {
    if (!doc) return;
    const total = doc.numPages;
    const first = currentPageRef.current;
    const order = [first, ...Array.from({ length: total }, (_, i) => i + 1).filter((n) => n !== first)];
    const collected: SearchMatch[] = [];
    lastNavIndexRef.current = -1;
    setSearchMatches([]);
    setActiveMatchIndex(0);
    setSearchProgress({ done: 0, total });
    for (let i = 0; i < order.length; i += 1) {
      if (searchSweepTokenRef.current !== token) return;
      try {
        const items = await getPageSearchItems(doc, order[i]);
        if (searchSweepTokenRef.current !== token) return;
        collected.push(...findMatches(items, rawQuery, order[i]));
        setSearchMatches(collected.slice());
      } catch {
        /* a page that fails to extract is skipped; the sweep continues */
      }
      if (searchSweepTokenRef.current !== token) return;
      setSearchProgress({ done: i + 1, total });
    }
    setSearchProgress(null);
  }, [doc]);

  useEffect(() => {
    if (!searchOpen || !doc) return;
    const token = ++searchSweepTokenRef.current;
    setSearchGeneration(token); // Wave 12.1 — invalidate PageView rect caches
    setResolvedHitRects({});    // Wave 12.1 — rects are per-query
    const query = searchQuery.trim();
    if (!query) {
      lastNavIndexRef.current = -1;
      setSearchMatches([]);
      setActiveMatchIndex(0);
      setSearchProgress(null);
      return;
    }
    const timer = setTimeout(() => { void runSearchSweep(query, token); }, 250);
    return () => clearTimeout(timer);
  }, [searchOpen, searchQuery, doc, runSearchSweep]);

  const safeActiveMatchIndex = searchMatches.length > 0
    ? Math.min(activeMatchIndex, searchMatches.length - 1)
    : 0;

  /* Next/Prev navigates EXACTLY when the active index changes — never when
     the student scrolls manually (that must not yank the view back). */
  useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) return;
    if (lastNavIndexRef.current === safeActiveMatchIndex) return;
    lastNavIndexRef.current = safeActiveMatchIndex;
    const match = searchMatches[safeActiveMatchIndex];
    if (match && match.page !== currentPage) goToPage(match.page);
  }, [searchOpen, safeActiveMatchIndex, searchMatches, currentPage, goToPage]);

  const searchNext = useCallback(() => {
    setActiveMatchIndex((index) => (searchMatches.length > 0 ? (index + 1) % searchMatches.length : 0));
  }, [searchMatches.length]);

  const searchPrev = useCallback(() => {
    setActiveMatchIndex((index) => (searchMatches.length > 0 ? (index - 1 + searchMatches.length) % searchMatches.length : 0));
  }, [searchMatches.length]);

  const openSearch = useCallback(() => {
    lastNavIndexRef.current = -1;
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    searchSweepTokenRef.current += 1; // cancel any in-flight sweep
    lastNavIndexRef.current = -1;
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatches([]);
    setActiveMatchIndex(0);
    setSearchProgress(null);
    setResolvedHitRects({});
    setSearchGeneration((generation) => generation + 1);
  }, []);

  /* ---- Wave 12.1 — PageView reports char-level rects resolved against the
          live text layer (R12.1.b). Identity-stable dedupe keeps sweep-tick
          re-renders cheap. ---- */
  const handleSearchRectsResolved = useCallback((pageNumber: number, rects: Array<NormalizedRect[] | null> | null) => {
    const key = `${docFingerprint}:${pageNumber}`;
    setResolvedHitRects((prev) => {
      if (rects === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      const existing = prev[key];
      if (existing && existing.length === rects.length && existing.every((entry, i) => entry === rects[i])) return prev;
      return { ...prev, [key]: rects };
    });
  }, [docFingerprint]);

  const renderScale = fitScale !== null ? fitScale * (ZOOM_STEPS[zoomIndex] ?? 1) : null;
  const zoomPercent = (ZOOM_STEPS[zoomIndex] ?? 1) * 100;

  /* Wave 11.11 — per-page highlight boxes (page pixel space, render scale
         applied); Wave 12.1 — each match consumes its DOM-resolved rects
         when the page's text layer has been resolved (char-precise, the
         same getClientRects pipeline as the text highlighter), and only
         falls back to the viewport-mapped boxes — now SLICE-aware
         (proportional run advance) — for matches the resolver could not
         pin. Pages without hits receive the stable empty list.

         R30.1 — the boxes are mapped through the page's cached scale-1
         viewport (Util.transform, the TextLayer's own pipeline) into
         normalized [0, 1] rects, then scaled by the SAME dims the canvas
         uses (dim × renderScale) — no more raw transform[4]/[5] mapping
         (user space is y-up; the canvas is y-down). */
  /* Wave 12.1 — matches grouped per page (the sweep emits a page's matches
         complete in one tick, so each page's array is append-only and stable
         in order) + the GLOBAL index of each page's first match, so the
         active highlight keeps its searchMatches-order semantics. */
  const matchesByPage = useMemo(() => {
    const matches = new Map<number, SearchMatch[]>();
    const firstGlobalIndex = new Map<number, number>();
    searchMatches.forEach((match, globalIndex) => {
      const list = matches.get(match.page);
      if (list) list.push(match);
      else {
        matches.set(match.page, [match]);
        firstGlobalIndex.set(match.page, globalIndex);
      }
    });
    return { matches, firstGlobalIndex };
  }, [searchMatches]);

  const searchHitsByPage = useMemo(() => {
    const map = new Map<number, SearchHitBox[]>();
    if (!searchOpen || renderScale === null || !doc || !dims) return map;
    const fingerprint = documentSearchCacheKey(doc);
    matchesByPage.matches.forEach((pageMatches, page) => {
      const viewport = getCachedPageSearchViewport(doc, page);
      const dim = dims[page - 1];
      if (!viewport || !dim) return;
      const cssWidth = dim.width * renderScale;
      const cssHeight = dim.height * renderScale;
      // Wave 12.1 — per-match DOM rects (char-precise) when the page's text
      // layer has been resolved; null entries → proportional slice fallback
      // for that match. Wave 12.2.B (M1) — the cached items feed the fallback
      // slices whenever the sweep warmed the cache, INDEPENDENT of the DOM
      // resolution outcome (the old `resolved ?` gate silently downgraded
      // warm-cache pages with no resolution to whole-item boxes).
      const resolved = resolvedHitRects[`${fingerprint}:${page}`];
      const cachedItems = getCachedPageSearchItems(doc, page);
      const firstGlobal = matchesByPage.firstGlobalIndex.get(page) ?? 0;
      const target: SearchHitBox[] = [];
      pageMatches.forEach((match, matchIndex) => {
        const active = firstGlobal + matchIndex === safeActiveMatchIndex;
        const rects = resolved && matchIndex < resolved.length ? resolved[matchIndex] : null;
        if (rects && rects.length > 0) {
          for (const rect of rects) {
            target.push({
              left: rect.x * cssWidth,
              top: rect.y * cssHeight,
              width: rect.w * cssWidth,
              height: rect.h * cssHeight,
              active,
            });
          }
          return;
        }
        // Wave 12.2.B (M1) — the fallback is the extracted pure helper: warm
        // cache → proportional slices. Wave 12.3.B (M2) — expansion items
        // (lam-alef ligatures) map their slices through the extraction-time
        // reverse index, so fractions are measured on the GLYPH domain the
        // advance width covers; cold cache → whole-item boxes (the honest
        // floor).
        for (const normalized of matchFallbackBoxes(match, cachedItems, viewport)) {
          target.push({
            left: normalized.left * cssWidth,
            top: normalized.top * cssHeight,
            width: normalized.width * cssWidth,
            height: normalized.height * cssHeight,
            active,
          });
        }
      });
      if (target.length > 0) map.set(page, target);
    });
    return map;
  }, [searchOpen, matchesByPage, safeActiveMatchIndex, renderScale, doc, dims, resolvedHitRects]);

  const pageCount = doc?.numPages ?? pagesCount ?? 0;
  /* Wave 11.11-C — the ACTIVE page is scanned (rendered, zero text items). */
  const scannedPage = pageHasText[currentPage] === false;

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
    <div
      className="flex h-full w-full flex-col gap-3"
      data-testid={testId ?? 'pdf-player'}
      data-pdf-focus-mode={focusMode ? 'true' : undefined}
      onClick={handleFocusTapReveal}
    >
      {/* Wave 12.2.C.5 — the top bar collapses to max-h-0/opacity-0 in focus
          mode (keep-mounted, overflow clipped, never display:none); the
          floating exit pill takes over as the visible chrome.
          Wave 12.3.A — `pdf-top-bar` testid (A.1 compact top bar), and the
          collapsed state is also `invisible` + aria-hidden (A.6 gate:
          attribute AND visual hiding; tab order dropped). */}
      <div
        data-testid="pdf-top-bar"
        aria-hidden={focusChromeHidden || undefined}
        className={`shrink-0 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${
          focusChromeHidden ? 'max-h-0 -translate-y-3 opacity-0 invisible' : 'max-h-60 translate-y-0 opacity-100'
        }`}
      >
      <PdfControlsBar
        tool={tool}
        highlightColor={highlightColor}
        onHighlightColorChange={setHighlightColor}
        penColor={penColor}
        onPenColorChange={setPenColor}
        penWidth={penWidth}
        onPenWidthChange={setPenWidth}
        shapeKind={shapeKind}
        onShapeKindChange={setShapeKind}
        shapeColor={shapeColor}
        onShapeColorChange={setShapeColor}
        noteColor={noteColor}
        onNoteColorChange={setNoteColor}
        canDeleteSelected={selectedShapeId !== null}
        onDeleteSelected={() => {
          if (selectedShapeId) {
            remove([selectedShapeId]);
            setSelectedShapeId(null);
          }
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={goToPage}
        onPrevPage={() => goToPage(currentPage - 1)}
        onNextPage={() => goToPage(currentPage + 1)}
        onSearchOpen={openSearch}
        scannedPage={scannedPage}
        scannedTitle={SCANNED_PAGE_TOOLTIP}
        zoomPercent={zoomPercent}
        onZoomIn={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
        onZoomOut={() => setZoomIndex((i) => Math.max(0, i - 1))}
        onZoomFit={() => setZoomIndex(0)}
        canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
        canZoomOut={zoomIndex > 0}
        saving={saving}
        focusMode={focusMode}
        onToggleFocus={toggleFocusMode}
      />
      </div>

      {/* Wave 12.2.C.1 — MAIN ROW: [StudyToolsPanel] [CenterScroll] [ThumbnailsRail].
          The flex-row order is LOGICAL (inline-start → inline-end): in the app's
          RTL layout study tools land RIGHT, the center column MIDDLE, and the
          thumbnails rail LEFT — the approved mockup. The row is the positioned
          ancestor of the floating search panel (z-30, internal to the row).
          RED LINE: the center scroll column is ALWAYS mounted and NEVER
          collapses (no display:none / w-0) — unmounting it would destroy
          canvas state, scroll position and the page IO observers. */}
      <div className="relative min-h-0 flex-1 flex flex-row">
        <StudyToolsPanel
          tool={tool}
          onToolChange={(next) => { setTool(next); setSelectedShapeId(null); }}
          highlightColor={highlightColor}
          onHighlightColorChange={setHighlightColor}
          penColor={penColor}
          onPenColorChange={setPenColor}
          shapeKind={shapeKind}
          onShapeKindChange={setShapeKind}
          shapeColor={shapeColor}
          onShapeColorChange={setShapeColor}
          noteColor={noteColor}
          onNoteColorChange={setNoteColor}
          searchOpen={searchOpen}
          onSearchToggle={searchOpen ? closeSearch : openSearch}
          scannedPage={scannedPage}
          scannedTitle={SCANNED_PAGE_TOOLTIP}
          focusMode={focusMode}
          onToggleFocus={toggleFocusMode}
          drawerOpen={toolsDrawerOpen}
          onDrawerOpenChange={setToolsDrawerOpen}
          onOpenList={openList}
          activeList={activeList}
          pageBookmarked={pageBookmarked}
          onBookmarkToggle={toggleBookmark}
        />
        {/* Wave 12.2.C.2 (E2) — the page stage joins the dark ramp: the white
            .pdf-page sheets are the ONLY light surface left (paper contract,
            non-negotiable). #071426 = the approved stage token. */}
        <div
          ref={scrollRef}
          data-testid="pdf-scroll"
          /* Wave 12.2.D (axe) — focusable scroll region: keyboard users can
             scroll the document column (axe scrollable-region-focusable). */
          tabIndex={0}
          role="region"
          aria-label="تمرير صفحات المستند"
          className="h-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-3xl bg-[#071426] px-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8] sm:px-6"
          style={{ touchAction: 'pan-y pinch-zoom' }}
        >
          {/* Wave 12.2.C.1 (E7) — max-w-4xl removed: the column fills the row
              (fitScale + ResizeObserver already cap the page width); px-2/
              sm:px-4 keep breathing room against the rail edges. */}
          <div ref={contentRef} className="mx-auto w-full px-2 sm:px-4">
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
                  shapeKind={shapeKind}
                  shapeColor={shapeColor}
                  selectedShapeId={selectedShapeId}
                  openNoteId={openNoteId}
                  searchHits={searchHitsByPage.get(pageNumber) ?? EMPTY_SEARCH_HITS}
                  searchSlices={matchesByPage.matches.get(pageNumber) ?? EMPTY_SEARCH_MATCHES}
                  searchGeneration={matchesByPage.matches.has(pageNumber) ? searchGeneration : 0}
                  onSearchRectsResolved={handleSearchRectsResolved}
                  registerPage={registerPage}
                  onTextPointerUp={handleTextPointerUp}
                  onTextLayerState={handleTextLayerState}
                  onStrokeCommit={commitInk}
                  onShapeCommit={commitShape}
                  onNotePlace={createNote}
                  onNoteOpen={setOpenNoteId}
                  onNoteCommit={commitNoteText}
                  onNoteDelete={deleteNote}
                  onNoteClose={closeNote}
                  flashAnnotationId={flashAnnotationId}
                  onEraseCommit={eraseAnnotations}
                />
              );
            })}
          </div>
        </div>

        {/* Wave 12.3.C — the study-lists panel. ≥ lg: a DOCKED side column
            between the tools rail and the center scroll; < lg: a slide-over
            drawer (same locked contract as the 12.3.A drawers). Exactly one
            variant mounts at a time (isCompact decides). */}
        {activeList && !isCompact && (
          <StudyListsPanel
            kind={activeList}
            variant="docked"
            notes={notesList}
            highlights={highlightsList}
            bookmarks={bookmarks}
            snippetFor={snippetFor}
            onEntryClick={handleListEntryClick}
            onBookmarkRemove={handleBookmarkRemove}
            onClose={closeList}
          />
        )}
        {activeList && isCompact && (
          <StudyListsPanel
            kind={activeList}
            variant="drawer"
            notes={notesList}
            highlights={highlightsList}
            bookmarks={bookmarks}
            snippetFor={snippetFor}
            onEntryClick={handleListEntryClick}
            onBookmarkRemove={handleBookmarkRemove}
            onClose={closeList}
          />
        )}

        {/* Wave 12.2.C.3 — inline-end rail slot (LEFT in RTL). Lazy 96px
            thumbnails, module-level offscreen canvas, FIFO-120 cache. */}
        <ThumbnailsRail
          doc={doc}
          dims={dims}
          activePage={currentPage}
          cacheKey={docFingerprint}
          onGoToPage={goToPage}
          focusMode={focusMode}
          drawerOpen={thumbsDrawerOpen}
          onDrawerOpenChange={setThumbsDrawerOpen}
        />

        {/* Wave 12.2.C.5 — focus-mode floating exit pill (the top bar is
            collapsed; Escape/F work as well). Centered via inset-x so no
            physical left/right offsets ever enter the tree.
            Wave 12.3.A (A.5) — MOBILE: the pill hides with the rest of the
            chrome and only reappears during the 3s tap-to-reveal peek. */}
        {focusMode && (!isCompact || chromePeeked) && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
            <button
              type="button"
              onClick={toggleFocusMode}
              aria-label="إنهاء وضع التركيز (Esc)"
              title="إنهاء وضع التركيز (Esc)"
              data-testid="pdf-focus-exit"
              className="press pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full border border-[#1e293b] bg-[#0b1120]/90 px-4 text-xs font-bold text-slate-200 shadow-2xl backdrop-blur transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
            >
              <Focus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              إنهاء وضع التركيز
            </button>
          </div>
        )}

        {/* Wave 11.11 — floating search panel: now anchored to the MAIN ROW
            (12.2.C.1), so it floats over the center column between the rails;
            z-30 internal to this wrapper. */}
        {searchOpen && (
          <PdfSearchPanel
            query={searchQuery}
            onQueryChange={setSearchQuery}
            matchCount={searchMatches.length}
            activeIndex={safeActiveMatchIndex}
            progress={searchProgress}
            onNext={searchNext}
            onPrev={searchPrev}
            onClose={closeSearch}
          />
        )}
      </div>

      {/* Wave 12.2.C.5 — status bar: page x/y · zoom % · saving · search i/n;
          hides through the same keep-mounted animation in focus mode
          (12.3.A adds `invisible` + aria-hidden — A.6 gate). */}
      <PdfStatusBar
        page={currentPage}
        pageCount={pageCount}
        zoomPercent={zoomPercent}
        saving={saving}
        searchOpen={searchOpen}
        matchCount={searchMatches.length}
        activeMatchIndex={safeActiveMatchIndex}
        focusMode={focusChromeHidden}
      />

      {/* Wave 12.3.A (A.2) — the mobile bottom action bar (< lg ONLY):
          Thumbnails | Page x/y | Zoom % | Study Tools. Lives INSIDE the
          player root flow (never fixed to the window), below the status
          bar, and collapses through the SAME keep-mounted focus animation
          (aria-hidden + invisible — A.5/A.6). */}
      <div
        aria-hidden={focusChromeHidden || undefined}
        className={`shrink-0 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${
          focusChromeHidden ? 'max-h-0 translate-y-2 opacity-0 invisible' : 'max-h-20 translate-y-0 opacity-100'
        }`}
      >
        <MobileActionBar
          page={currentPage}
          pageCount={pageCount}
          onGoToPage={goToPage}
          onPrevPage={() => goToPage(currentPage - 1)}
          onNextPage={() => goToPage(currentPage + 1)}
          zoomPercent={zoomPercent}
          onZoomIn={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
          onZoomOut={() => setZoomIndex((i) => Math.max(0, i - 1))}
          onZoomFit={() => setZoomIndex(0)}
          canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
          canZoomOut={zoomIndex > 0}
          thumbsOpen={thumbsDrawerOpen}
          onThumbsToggle={() => setThumbsDrawerOpen((open) => !open)}
          toolsOpen={toolsDrawerOpen}
          onToolsToggle={() => setToolsDrawerOpen((open) => !open)}
        />
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
  /* Wave 11.10 — shape + note state and callbacks. */
  shapeKind: ShapeKind;
  shapeColor: string;
  selectedShapeId: string | null;
  openNoteId: string | null;
  /** Wave 11.11 — transient search-hit boxes for THIS page (page px space). */
  searchHits: SearchHitBox[];
  /** Wave 12.1 — this page's search matches (slice domain) for DOM resolution. */
  searchSlices: SearchMatch[];
  /** Wave 12.1 — sweep generation (query identity) guarding the resolver cache. */
  searchGeneration: number;
  /** Wave 12.1 — reports per-match DOM-resolved rects (null = unresolved).
   *  Wave 12.2.B (M3) — carries the optional per-run resolver stats. */
  onSearchRectsResolved: (pageNumber: number, rects: Array<NormalizedRect[] | null> | null, stats?: SearchResolveStats) => void;
  /** Wave 11.11-C — reports text-layer presence after each page render. */
  onTextLayerState: (pageNumber: number, hasText: boolean) => void;
  /** Wave 12.3.C — the annotation briefly FLASHED from the study lists
   *  (notes/highlights): pulses the target's nodes for ~1.6s. */
  flashAnnotationId: string | null;
  registerPage: (pageNumber: number, el: HTMLElement | null) => void;
  /** Pointer/highlighter routing on the text layer (see handleTextPointerUp). */
  onTextPointerUp: (pageNumber: number, clientX: number, clientY: number) => void;
  onStrokeCommit: (pageNumber: number, points: NormalizedPoint[], pageWidthPx: number) => void;
  onShapeCommit: (pageNumber: number, kind: ShapeKind, sx: number, sy: number, ex: number, ey: number, pageWidthPx: number) => void;
  /** Note tool: a tap on the page places a note (called with page coords). */
  onNotePlace: (pageNumber: number, clientX: number, clientY: number) => void;
  onNoteOpen: (id: string) => void;
  onNoteCommit: (note: NoteAnnotation, text: string) => void;
  onNoteDelete: (id: string) => void;
  onNoteClose: () => void;
  /** Wave 11.11 — eraser: called ONCE per gesture with the touched ids. */
  onEraseCommit: (pageNumber: number, ids: string[]) => void;
}

/** Hotfix R15.3 — memoized: every prop is a primitive, a stable callback, or a
 *  reference that only changes when content actually changes, so unrelated
 *  renders (scroll, saves on other pages) never re-render this page's canvas
 *  or text layer. */
const PageView = memo(function PageView({
  pageNumber, cssWidth, cssHeight, renderScale, doc, visible,
  annotations, tool, penColor, penWidth,
  shapeKind, shapeColor, selectedShapeId, openNoteId, searchHits,
  searchSlices, searchGeneration, onSearchRectsResolved, flashAnnotationId,
  registerPage, onTextPointerUp, onTextLayerState, onStrokeCommit,
  onShapeCommit, onNotePlace, onNoteOpen, onNoteCommit, onNoteDelete, onNoteClose, onEraseCommit,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [pageReady, setPageReady] = useState(false);
  /* Wave 12.1 — bumped after every successful text-layer build so the DOM
   * resolver re-runs against the fresh spans (zoom/visibility rebuilds). */
  const [layerVersion, setLayerVersion] = useState(0);
  /* Wave 12.1 — the RAW str-bearing item strings of the last getTextContent
   * (the span-text domain pdf.js paints; '' included, no span for it).
   * Ref, not state: only the resolver effect reads it. */
  const rawStringsRef = useRef<string[] | null>(null);
  /* Wave 12.1 — span map + resolution bookkeeping, keyed by layer build. */
  const spanMapRef = useRef<{ version: number; map: ReturnType<typeof createSearchSpanMap> } | null>(null);
  const resolveStateRef = useRef<{ version: number; generation: number; count: number }>({
    version: -1, generation: -1, count: 0,
  });
  // Hotfix R15.3 — the active stroke lives in refs, never in React state:
  // pointermove appends to the buffer and repaints ONE <path> via its d
  // attribute (rAF-throttled); React state is touched exactly once, on
  // pointerup, through onStrokeCommit. The per-move whole-player re-render
  // that made the screen flicker while drawing is gone.
  const strokeRef = useRef<{ points: NormalizedPoint[]; color: string; width: number } | null>(null);
  const livePathRef = useRef<SVGPathElement | null>(null);
  const strokeRafRef = useRef(0);

  /* Wave 11.10 — the shape drag preview uses the SAME ref-buffer pattern: the
   * live nodes are created imperatively and updated rAF-throttled; React
   * state is touched exactly once, on pointerup, through onShapeCommit. */
  const shapeDraftRef = useRef<{
    kind: ShapeKind;
    sx: number;
    sy: number;
    group: SVGGElement;
    main: SVGElement;
    head: SVGPolygonElement | null;
    pw: number;
    ph: number;
  } | null>(null);
  const shapeRafRef = useRef(0);
  const shapeCurRef = useRef<NormalizedPoint>({ x: 0, y: 0 });
  /* Wave 11.10 — note tool: pointerdown anchor on the canvas, so a tap (not a
   * drag/scroll gesture) places the note. */
  const noteDownRef = useRef<{ x: number; y: number } | null>(null);
  /* Wave 11.11 — eraser gesture: same ref-buffer contract (no React state in
   * pointermove). The preview dims annotation nodes a commit would delete;
   * React state is touched exactly once, on pointerup, via onEraseCommit. */
  const eraserPathRef = useRef<NormalizedPoint[] | null>(null);
  const eraserRafRef = useRef(0);

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
        // Wave 12.1 — the span-text domain pdf.js is about to paint: EVERY
        // str-bearing item verbatim ('' included — pdf.mjs:21512/21568 skips
        // its span). Byte-identical to the search cache's strings (both run
        // normalizeArabicPresentationForms), which is what makes the
        // resolver's strict per-span verification valid.
        rawStringsRef.current = items.flatMap((item) => ('str' in item ? [item.str] : []));
        const textLayer = new TextLayer({
          textContentSource: { lang: textContent.lang, items, styles: textContent.styles },
          container: layer,
          viewport,
        });
        await textLayer.render();
        if (cancelled) return;
        // Wave 12.1 — the layer is fresh: DOM re-resolution may proceed.
        setLayerVersion((version) => version + 1);
        // Wave 11.11-C — scanned-page detection: a page whose text content
        // carries zero non-whitespace items has no usable text layer
        // (image-only scans). Reported once per render; the parent gates the
        // text-dependent tools on the CURRENT page's fact.
        const hasTextLayer = items.some((item) => 'str' in item && item.str.trim().length > 0);
        onTextLayerState(pageNumber, hasTextLayer);
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
      // Wave 12.1 — the span domain is gone with the layer.
      rawStringsRef.current = null;
      spanMapRef.current = null;
    };
  }, [visible, pageReady, renderScale, pageNumber, doc, onTextLayerState]);

  /* ---- Wave 12.1 — char-level search rects through the text-layer DOM
          (R12.1.b): a Range over the pinned spans, normalized with the
          production rectsFromRange pipeline. Runs when the layer is (re)built
          (layerVersion) or when this page's matches arrive (the sweep emits a
          page's matches complete in one tick). The strict
          version+generation+count guard keeps sweep ticks for OTHER pages
          from re-resolving this one. ---- */
  useEffect(() => {
    if (searchSlices.length === 0) return;
    const layer = layerRef.current;
    const canvas = canvasRef.current;
    const rawStrings = rawStringsRef.current;
    if (!layer || !canvas || !rawStrings || rawStrings.length === 0) return;
    if (layer.textContent === '') return; // wiped / not yet built — fallback boxes show
    const state = resolveStateRef.current;
    if (state.version === layerVersion && state.generation === searchGeneration && state.count === searchSlices.length) return;
    const pageRect = canvas.getBoundingClientRect();
    if (!(pageRect.width > 0) || !(pageRect.height > 0)) return;
    // Both cache reads are warm the moment matches exist: the sweep extracts
    // (and caches) a page before findMatches ever runs on it.
    const cachedItems = getCachedPageSearchItems(doc, pageNumber);
    const sourceIndexes = getCachedPageSearchSourceIndexes(doc, pageNumber);
    if (!cachedItems || cachedItems.length === 0 || !sourceIndexes) return;
    let spanMap = spanMapRef.current;
    if (!spanMap || spanMap.version !== layerVersion) {
      spanMap = {
        version: layerVersion,
        map: createSearchSpanMap(layer, {
          rawItemStrings: rawStrings,
          rawIndexOfItem: sourceIndexes,
        }),
      };
      spanMapRef.current = spanMap;
    }
    const stats = createSearchResolveStats();
    const rects = searchSlices.map((match) => resolveSearchMatchRects(spanMap.map.spanForItem, match, pageRect, stats));
    resolveStateRef.current = { version: layerVersion, generation: searchGeneration, count: searchSlices.length };
    // Wave 12.2.B (M3) — resolver observability: per-run counters surfaced as
    // a data attribute on the layer, a DEV console.warn, and the (optional)
    // stats payload of onSearchRectsResolved for the future status bar.
    layer.dataset.resolverNulls = String(stats.nullCount);
    if (import.meta.env.DEV && stats.nullCount > 0) {
      console.warn(
        `[PdfPlayer] search resolver: ${stats.nullCount}/${searchSlices.length} matches unresolved on page ${pageNumber}`,
        stats.reasons,
      );
    }
    onSearchRectsResolved(pageNumber, rects, stats);
  }, [layerVersion, searchSlices, searchGeneration, doc, pageNumber, onSearchRectsResolved]);

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

  const paintLiveShape = useCallback(() => {
    if (shapeRafRef.current) return;
    shapeRafRef.current = requestAnimationFrame(() => {
      shapeRafRef.current = 0;
      const draft = shapeDraftRef.current;
      if (!draft) return;
      const { x, y } = shapeCurRef.current;
      if (draft.kind === 'arrow') {
        const line = draft.main as SVGLineElement;
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(y));
        draft.head?.setAttribute('points', polygonPointsAttr(
          arrowHeadPoints(draft.sx, draft.sy, x, y, draft.pw, draft.ph, ARROW_HEAD_LENGTH_PX, ARROW_HEAD_HALF_WIDTH_PX),
        ));
      } else {
        const box = normalizeBox(draft.sx, draft.sy, x, y);
        if (draft.kind === 'rect') {
          const rect = draft.main as SVGRectElement;
          rect.setAttribute('x', String(box.x));
          rect.setAttribute('y', String(box.y));
          rect.setAttribute('width', String(box.w));
          rect.setAttribute('height', String(box.h));
        } else if (draft.kind === 'ellipse') {
          const ellipse = draft.main as SVGEllipseElement;
          ellipse.setAttribute('cx', String(box.x + box.w / 2));
          ellipse.setAttribute('cy', String(box.y + box.h / 2));
          ellipse.setAttribute('rx', String(box.w / 2));
          ellipse.setAttribute('ry', String(box.h / 2));
        } else {
          (draft.main as SVGPolygonElement).setAttribute('points', polygonPointsAttr(starPolygonPoints(box)));
        }
      }
    });
  }, []);

  const clearLiveShape = useCallback(() => {
    if (shapeRafRef.current) { cancelAnimationFrame(shapeRafRef.current); shapeRafRef.current = 0; }
    shapeDraftRef.current?.group.remove();
    shapeDraftRef.current = null;
  }, []);

  // Teardown if the page unmounts mid-drag.
  useEffect(() => clearLiveShape, [clearLiveShape]);

  /* Wave 11.11 — live erase preview: rAF-throttled hit test of the gesture
   * path against this page's annotations, dimming the doomed nodes via a CSS
   * class (imperative, like the pen/shape live nodes). */
  const paintLiveEraser = useCallback(() => {
    if (eraserRafRef.current) return;
    eraserRafRef.current = requestAnimationFrame(() => {
      eraserRafRef.current = 0;
      const overlay = overlayRef.current;
      const path = eraserPathRef.current;
      if (!overlay || !path) return;
      const overlayBox = overlay.getBoundingClientRect();
      const pageWidthPx = overlayBox.width > 0 ? overlayBox.width : cssWidth;
      const hitSet = new Set(collectEraserHitIds(annotations, path, ERASER_RADIUS_PX / pageWidthPx, pageWidthPx));
      // Wave 12.2.A — PAGE-level query: committed highlights live in the
      // sibling blend SVG (z 10), not the ink overlay, so the dim preview
      // must sweep [data-annotation-id] across the whole page box — the same
      // page-host pattern the note preview below already uses.
      const pageEl = overlay.parentElement;
      pageEl?.querySelectorAll('[data-annotation-id]').forEach((el) => {
        const id = el.getAttribute('data-annotation-id') ?? '';
        el.classList.toggle('pdf-erase-preview', hitSet.has(id));
      });
      // Notes live in the DOM layer above (z 25) — the page box hosts both.
      pageEl?.querySelectorAll('[data-note-id]').forEach((el) => {
        const id = el.getAttribute('data-note-id') ?? '';
        el.classList.toggle('pdf-erase-preview', hitSet.has(id));
      });
    });
  }, [annotations, cssWidth]);

  const clearLiveEraser = useCallback(() => {
    if (eraserRafRef.current) { cancelAnimationFrame(eraserRafRef.current); eraserRafRef.current = 0; }
    const overlay = overlayRef.current;
    // Wave 12.2.A — one PAGE-level sweep clears ink/shapes AND highlights
    // (the z-10 blend SVG is a sibling of the overlay inside the page box);
    // note icons ride the same host.
    overlay?.parentElement?.querySelectorAll('.pdf-erase-preview').forEach((el) => el.classList.remove('pdf-erase-preview'));
    eraserPathRef.current = null;
  }, []);

  // Teardown if the page unmounts mid-gesture.
  useEffect(() => clearLiveEraser, [clearLiveEraser]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = overlayRef.current;
    if (!svg) return;
    if (tool === 'pen') {
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
      return;
    }
    if (tool === 'eraser') {
      event.currentTarget.setPointerCapture(event.pointerId);
      eraserPathRef.current = [toNormalized(event.clientX, event.clientY)];
      return;
    }
    if (tool !== 'shape') return;
    /* Wave 11.10 — shape drag: same imperative live-node contract as the pen. */
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = toNormalized(event.clientX, event.clientY);
    shapeCurRef.current = start;
    const overlayBox = svg.getBoundingClientRect();
    const pageWidthPx = overlayBox.width > 0 ? overlayBox.width : cssWidth;
    const pageHeightPx = overlayBox.height > 0 ? overlayBox.height : cssHeight;
    const svgNS = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(svgNS, 'g');
    group.setAttribute('class', 'pdf-shape-live');
    let main: SVGElement;
    let head: SVGPolygonElement | null = null;
    if (shapeKind === 'rect') {
      main = document.createElementNS(svgNS, 'rect');
    } else if (shapeKind === 'ellipse') {
      main = document.createElementNS(svgNS, 'ellipse');
    } else if (shapeKind === 'star') {
      main = document.createElementNS(svgNS, 'polygon');
    } else {
      main = document.createElementNS(svgNS, 'line');
      main.setAttribute('x1', String(start.x));
      main.setAttribute('y1', String(start.y));
      head = document.createElementNS(svgNS, 'polygon');
      head.setAttribute('class', 'pdf-arrow-head');
      head.setAttribute('fill', shapeColor);
      group.appendChild(head);
    }
    main.setAttribute('class', 'pdf-shape');
    main.setAttribute('stroke', shapeColor);
    main.setAttribute('stroke-width', String(SHAPE_STROKE_PX / pageWidthPx));
    main.setAttribute('fill', 'none');
    group.appendChild(main);
    svg.appendChild(group);
    shapeDraftRef.current = { kind: shapeKind, sx: start.x, sy: start.y, group, main, head, pw: pageWidthPx, ph: pageHeightPx };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'pen') {
      if (!strokeRef.current) return;
      const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
      const sources = coalesced.length > 0 ? coalesced : [native];
      for (const source of sources) {
        strokeRef.current.points.push(toNormalized(source.clientX, source.clientY));
      }
      paintLiveStroke();
      return;
    }
    if (tool === 'eraser') {
      if (!eraserPathRef.current) return;
      const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
      const sources = coalesced.length > 0 ? coalesced : [native];
      for (const source of sources) {
        eraserPathRef.current.push(toNormalized(source.clientX, source.clientY));
      }
      paintLiveEraser();
      return;
    }
    if (tool !== 'shape' || !shapeDraftRef.current) return;
    const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const sources = coalesced.length > 0 ? coalesced : [native];
    for (const source of sources) {
      shapeCurRef.current = toNormalized(source.clientX, source.clientY);
    }
    paintLiveShape();
  };

  const handlePointerUp = () => {
    if (tool === 'pen') {
      if (!strokeRef.current) return;
      const stroke = strokeRef.current;
      if (strokeRafRef.current) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current = 0; }
      livePathRef.current?.setAttribute('d', strokePathD(stroke.points));
      clearLiveStroke();
      onStrokeCommit(pageNumber, stroke.points, cssWidth);
      return;
    }
    if (tool === 'eraser') {
      const path = eraserPathRef.current;
      clearLiveEraser();
      if (!path || path.length === 0) return;
      const overlayBox = overlayRef.current?.getBoundingClientRect();
      const pageWidthPx = overlayBox && overlayBox.width > 0 ? overlayBox.width : cssWidth;
      const ids = collectEraserHitIds(annotations, path, ERASER_RADIUS_PX / pageWidthPx, pageWidthPx);
      if (ids.length > 0) onEraseCommit(pageNumber, ids);
      return;
    }
    if (tool !== 'shape' || !shapeDraftRef.current) return;
    const draft = shapeDraftRef.current;
    clearLiveShape();
    onShapeCommit(pageNumber, draft.kind, draft.sx, draft.sy, shapeCurRef.current.x, shapeCurRef.current.y, draft.pw);
  };

  const handlePointerCancel = () => {
    clearLiveStroke();
    clearLiveShape();
    clearLiveEraser();
  };

  /* Wave 11.11 — the eraser joins the pen/shape as a full drawing surface:
   * the z-11 overlay takes the pointer, the text layer goes dormant. */
  const drawingSurface = tool === 'pen' || tool === 'shape' || tool === 'eraser';

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
      <canvas
        ref={canvasRef}
        aria-label={`صفحة ${pageNumber}`}
        /* Wave 11.10 — note placement rides the canvas: in note mode the text
         * layer is dormant (per the supervisor contract), so a tap lands here —
         * the deepest interactive surface of the page. Icons/editor above still
         * get their own events. A drag (>8px) is a gesture, not a placement. */
        onPointerDown={tool === 'note' ? (event) => { noteDownRef.current = { x: event.clientX, y: event.clientY }; } : undefined}
        onPointerUp={tool === 'note' ? (event) => {
          const start = noteDownRef.current;
          noteDownRef.current = null;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
          onNotePlace(pageNumber, event.clientX, event.clientY);
        } : undefined}
      />

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
            // Wave 12.2.A — data-annotation-id lets the eraser's page-level
            // preview dim committed highlights exactly like ink/shapes/notes.
            // Wave 12.3.C — pdf-annotation-flash pulses the rects when the
            // entry is clicked in the highlights list.
            <g
              key={annotation.id}
              className={`pdf-highlight${annotation.id === flashAnnotationId ? ' pdf-annotation-flash' : ''}`}
              data-annotation-id={annotation.id}
            >
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
        onPointerCancel={handlePointerCancel}
      >
        {annotations.map((annotation) => {
          if (annotation.annotationType === 'Ink') {
            return (
              <path
                key={annotation.id}
                className="pdf-ink"
                data-annotation-id={annotation.id}
                d={strokePathD(annotation.payload.points)}
                stroke={annotation.payload.color}
                /* Hotfix R16.4: page-relative fraction against the unit viewBox
                   (see resolveInkStrokeWidth) — no raw px, no vector-effect. */
                strokeWidth={resolveInkStrokeWidth(annotation.payload.width, cssWidth)}
              />
            );
          }
          if (annotation.annotationType === 'Shape') {
            return (
              <ShapeNodes
                key={annotation.id}
                annotation={annotation}
                cssWidth={cssWidth}
                cssHeight={cssHeight}
                selected={annotation.id === selectedShapeId}
              />
            );
          }
          /* Highlight → the blend layer above; Note → the DOM note layer. */
          return null;
        })}
      </svg>

      {/* Wave 11.11 — transient search-hit layer (z 15, between ink and text;
          pointer-events none, never persisted, driven by search state only). */}
      {searchHits.length > 0 && (
        <div
          className="pdf-search-layer"
          data-testid={`pdf-search-layer-${pageNumber}`}
          aria-hidden="true"
        >
          {searchHits.map((hit, index) => (
            <div
              key={index}
              className={`pdf-search-hit${hit.active ? ' is-active' : ''}`}
              data-active={hit.active ? 'true' : 'false'}
              style={{ left: hit.left, top: hit.top, width: hit.width, height: hit.height }}
            />
          ))}
        </div>
      )}

      <div
        ref={layerRef}
        className={`pdf-text-layer${tool === 'pen' || tool === 'shape' || tool === 'note' || tool === 'eraser' ? ' is-dormant' : ''}${textLayerDebugClass()}`}
        data-pdf-text-layer="true"
        /* Pointer + highlighter modes only: the layer is dormant in pen/shape
           (the ink SVG must receive the drag) and note mode (the canvas receives
           the tap). The parent routes highlight-commit vs shape hit-test. */
        onPointerUp={tool === 'pointer' || tool === 'highlighter'
          ? (event) => onTextPointerUp(pageNumber, event.clientX, event.clientY)
          : undefined}
      />

      {/* Wave 11.10 — sticky notes: DOM layer ABOVE the text layer (z 25);
          container pointer-events none, icons/editor opt back in. */}
      <NoteLayer
        annotations={annotations}
        openNoteId={openNoteId}
        passive={tool === 'eraser'}
        flashNoteId={flashAnnotationId}
        onOpen={onNoteOpen}
        onCommit={onNoteCommit}
        onDelete={onNoteDelete}
        onClose={onNoteClose}
      />
    </div>
  );
});

/* ===== Wave 11.10 — committed shape rendering (inside the z-11 ink SVG) =====
 * Box kinds read the drag box; the arrow computes its head in pixel space and
 * stops the shaft at the wing midpoint so the tip stays sharp. Geometry that
 * fails validation (e.g. a legacy/corrupt payload without w/h) renders null. */
function ShapeNodes({ annotation, cssWidth, cssHeight, selected }: {
  annotation: Extract<PdfAnnotation, { annotationType: 'Shape' }>;
  cssWidth: number;
  cssHeight: number;
  selected: boolean;
}) {
  const p = annotation.payload;
  const stroke = resolveInkStrokeWidth(p.strokeWidth, cssWidth);
  const className = `pdf-shape${selected ? ' is-selected' : ''}`;

  if (p.shape === 'arrow') {
    if (p.x1 === undefined || p.y1 === undefined || p.x2 === undefined || p.y2 === undefined) return null;
    const head = arrowHeadPoints(p.x1, p.y1, p.x2, p.y2, cssWidth, cssHeight, ARROW_HEAD_LENGTH_PX, ARROW_HEAD_HALF_WIDTH_PX);
    const baseX = (head[0].x + head[2].x) / 2;
    const baseY = (head[0].y + head[2].y) / 2;
    return (
      <g className={className} data-annotation-id={annotation.id}>
        <line x1={p.x1} y1={p.y1} x2={baseX} y2={baseY} stroke={p.color} strokeWidth={stroke} />
        <polygon className="pdf-arrow-head" points={polygonPointsAttr(head)} fill={p.color} stroke={p.color} strokeWidth={stroke} />
      </g>
    );
  }

  if (p.w === undefined || p.h === undefined) return null;
  if (p.shape === 'rect') {
    return <rect className={className} data-annotation-id={annotation.id} x={p.x} y={p.y} width={p.w} height={p.h} stroke={p.color} strokeWidth={stroke} />;
  }
  if (p.shape === 'ellipse') {
    return <ellipse className={className} data-annotation-id={annotation.id} cx={p.x + p.w / 2} cy={p.y + p.h / 2} rx={p.w / 2} ry={p.h / 2} stroke={p.color} strokeWidth={stroke} />;
  }
  if (p.shape === 'star') {
    return <polygon className={className} data-annotation-id={annotation.id} points={polygonPointsAttr(starPolygonPoints({ x: p.x, y: p.y, w: p.w, h: p.h }))} stroke={p.color} strokeWidth={stroke} />;
  }
  return null;
}

export default PdfPlayer;
