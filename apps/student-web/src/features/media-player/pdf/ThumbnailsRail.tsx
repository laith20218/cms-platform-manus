import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cn } from '@/utils';

/**
 * Wave 12.2.C.3 — lazy thumbnails rail (inline-end of the main row; LEFT in
 * the app's RTL layout — the approved mockup order [StudyTools][Center][Thumbs]).
 *
 * Resource contract (supervisor E3, §4):
 *  - ONE module-level offscreen canvas, reused across every thumb render;
 *    serial render chain (never parallel page.render() calls);
 *  - dpr 1 — thumbnails are 96px-wide previews, retina sharpness buys nothing;
 *  - rendered thumbs cached as JPEG data URLs in a FIFO Map capped at 120
 *    entries keyed by the document fingerprint, evicting the oldest;
 *  - an IntersectionObserver per list (rootMargin '240px 0px') enqueues
 *    renders just before a thumb scrolls into view — nothing renders until
 *    then; in-flight page.render() tasks are cancelled on unmount
 *    (precedent: PdfPlayer page-render teardown).
 *
 * Layout: ≥ lg the rail is a 96px column beside the center scroll (its own
 * overflow — never the center's); < lg it collapses into a Radix Dialog
 * drawer (inline-end anchored) whose ONLY trigger is the bottom action bar
 * (MobileActionBar, 12.3.A.2) — the old bottom-left floating toggle was
 * REMOVED below `lg` (12.3.A.3). The drawer is controlled (open + onChange
 * lifted to PdfPlayer) so one state drives trigger highlight, drawer and
 * focus-mode interplay. Focus mode (12.2.C.5) hides the rail entirely via
 * the focusMode prop.
 *
 * 12.3.A.4 — drawer contract: max-w-[85vw], dimmed backdrop bg-black/60
 * (data-testid="pdf-drawer-backdrop"), tap-outside closes (Radix modal
 * default), slides from the inline-END side (LEFT in RTL).
 *
 * §13: logical properties only (border-s/end-*), 48px+ touch targets,
 * focus-visible rings, aria-current on the active thumb, reduced-motion-safe
 * auto-scroll, ramp tokens (#0b1120 rail / #1e293b borders / #1685F8 active /
 * #25C7E8 focus / slate-400 muted).
 */

const THUMB_WIDTH_PX = 96;
const THUMB_CACHE_MAX_ENTRIES = 120;
const IO_ROOT_MARGIN = '240px 0px';
const JPEG_QUALITY = 0.75;

/** FIFO cache of rendered thumbnails (document-fingerprint keyed). */
const THUMB_CACHE = new Map<string, string>();

/** ONE offscreen canvas for every render (E3: single reused surface). */
let offscreenCanvas: HTMLCanvasElement | null = null;

/** Serial render chain — module-level so the desktop rail and the mobile
 *  drawer can never race two parallel page.render() calls. */
let renderChain: Promise<void> = Promise.resolve();

/** In-flight render tasks by cache key — cancelled on rail unmount. */
const IN_FLIGHT = new Map<string, { cancel: () => void }>();

function takeOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  if (!offscreenCanvas) offscreenCanvas = document.createElement('canvas');
  if (offscreenCanvas.width !== width) offscreenCanvas.width = width;
  if (offscreenCanvas.height !== height) offscreenCanvas.height = height;
  return offscreenCanvas;
}

function cachePut(key: string, dataUrl: string): void {
  if (THUMB_CACHE.size >= THUMB_CACHE_MAX_ENTRIES) {
    const oldest = THUMB_CACHE.keys().next();
    if (!oldest.done) THUMB_CACHE.delete(oldest.value);
  }
  THUMB_CACHE.set(key, dataUrl);
}

/**
 * Renders ONE thumbnail into the shared offscreen canvas (serial — callers
 * chain through `renderChain`) and hands the data URL to `onDone` so the
 * owning list can paint it. Cache-first: a warm entry short-circuits.
 */
async function renderThumb(
  doc: PDFDocumentProxy,
  cacheKey: string,
  pageNumber: number,
  onDone: (dataUrl: string) => void,
): Promise<void> {
  const key = `${cacheKey}:${pageNumber}`;
  const cached = THUMB_CACHE.get(key);
  if (cached) {
    onDone(cached);
    return;
  }
  if (IN_FLIGHT.has(key)) return;
  try {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    if (!(base.width > 0) || !(base.height > 0)) return;
    const scale = THUMB_WIDTH_PX / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = takeOffscreenCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
    const context = canvas.getContext('2d');
    if (!context) return;
    // Opaque paper base — JPEG data URLs are transparent-free by design,
    // and the fill keeps any pdf.js transparent-paint path honest.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const task = page.render({ canvas, canvasContext: context, viewport });
    IN_FLIGHT.set(key, task);
    await task.promise;
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    cachePut(key, dataUrl);
    onDone(dataUrl);
  } catch (error) {
    // Cancellations are routine (unmount/eviction races); anything else is
    // a real failure — the thumb simply stays uncached and the IO will
    // retry on the next intersection pass.
    const name = (error as { name?: string } | null)?.name;
    if (name !== 'RenderingCancelledException') {
      console.warn(`[ThumbnailsRail] page ${pageNumber} thumb render failed:`, error);
    }
  } finally {
    IN_FLIGHT.delete(key);
  }
}

/** Reduced-motion-aware auto-scroll (§13 motion contract). Guarded: jsdom
 *  (and some legacy engines) implement no scrollIntoView. */
function scrollNearest(el: HTMLElement): void {
  if (typeof el.scrollIntoView !== 'function') return;
  const reduce = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
}

export interface ThumbnailsRailProps {
  doc: PDFDocumentProxy;
  /** Page dimensions at scale 1 (already cached in PdfPlayer) — aspect source. */
  dims: ReadonlyArray<{ width: number; height: number }>;
  activePage: number;
  /** Document fingerprint scoping the thumb cache (two docs never share). */
  cacheKey: string;
  onGoToPage: (page: number) => void;
  /** Wave 12.2.C.5 — focus mode hides the rail entirely (still mounted). */
  focusMode?: boolean;
  /** Wave 12.3.A — controlled mobile drawer (lifted to PdfPlayer: the bottom
   *  action bar is the only trigger below `lg`, 12.3.A.2/A.3). */
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
}

export function ThumbnailsRail({ doc, dims, activePage, cacheKey, onGoToPage, focusMode = false, drawerOpen, onDrawerOpenChange }: ThumbnailsRailProps) {
  const railScrollRef = useRef<HTMLDivElement | null>(null);

  // Cancel every in-flight thumb render of THIS document when the rail leaves
  // the tree (player unmount / doc swap). Drawer open/close never cancels.
  useEffect(() => {
    return () => {
      for (const [key, task] of IN_FLIGHT) {
        if (key.startsWith(`${cacheKey}:`)) {
          task.cancel();
          IN_FLIGHT.delete(key);
        }
      }
    };
  }, [cacheKey]);

  return (
    <>
      {/* Desktop rail (≥ lg): a 96px column with its OWN vertical scroll.
          Focus mode (12.2.C.5) animates the WIDTH to 0 — keep-mounted,
          overflow-hidden, border dropped; the inner fixed-width column keeps
          every thumb laid out (no reflow, IO state intact). */}
      <nav
        data-testid="pdf-thumbs-rail"
        aria-label="مصغرات الصفحات"
        aria-hidden={focusMode || undefined}
        className={cn(
          'hidden h-full shrink-0 overflow-hidden border-s transition-all duration-200 ease-out motion-reduce:transition-none lg:block',
          focusMode ? 'w-0 border-transparent' : 'w-24 border-[#1e293b]',
        )}
      >
        <div className="flex h-full w-24 flex-col bg-[#0b1120]">
          <div ref={railScrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2">
            <ThumbList
              doc={doc}
              dims={dims}
              activePage={activePage}
              cacheKey={cacheKey}
              onGoToPage={onGoToPage}
              ioRoot={railScrollRef.current}
              testIdPrefix="pdf-thumb"
            />
          </div>
        </div>
      </nav>

      {/* Mobile (< lg): inline-end Dialog drawer. CONTROLLED — the only
          trigger is the bottom action bar (12.3.A.2); the floating toggle
          was removed (12.3.A.3). Backdrop: dimmed bg-black/60 with the
          drawer-backdrop testid; tap-outside closes (Radix modal default). */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-testid="pdf-drawer-backdrop"
            className="fixed inset-0 z-50 bg-black/60"
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 end-0 z-50 flex w-72 max-w-[85vw] flex-col border-s border-[#1e293b] bg-[#0b1120] p-3 shadow-2xl outline-none"
          >
            <div className="mb-2 flex items-center justify-between">
              <DialogPrimitive.Title className="text-sm font-bold text-white">مصغرات الصفحات</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="إغلاق المصغرات"
                data-testid="pdf-thumbs-close"
                className="press flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
              >
                <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <ThumbList
                doc={doc}
                dims={dims}
                activePage={activePage}
                cacheKey={cacheKey}
                onGoToPage={(page) => { onGoToPage(page); onDrawerOpenChange(false); }}
                ioRoot={null}
                testIdPrefix="pdf-thumb-drawer"
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

interface ThumbListProps {
  doc: PDFDocumentProxy;
  dims: ReadonlyArray<{ width: number; height: number }>;
  activePage: number;
  cacheKey: string;
  onGoToPage: (page: number) => void;
  /** IO root: the rail's scrollport, or null (viewport) inside the drawer. */
  ioRoot: HTMLElement | null;
  testIdPrefix: string;
}

/** The per-button list + IntersectionObserver. Rendered data URLs arrive via
 *  the render chain's onDone callback (and the FIFO cache seeds warm entries). */
function ThumbList({ doc, dims, activePage, cacheKey, onGoToPage, ioRoot, testIdPrefix }: ThumbListProps) {
  const buttonsRef = useRef(new Map<number, HTMLElement>());
  const mountedRef = useRef(true);
  const [rendered, setRendered] = useState<Record<number, string>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Seed from the FIFO cache (warm entries from earlier renders/the other list).
  useEffect(() => {
    const seeded: Record<number, string> = {};
    dims.forEach((_, index) => {
      const page = index + 1;
      const hit = THUMB_CACHE.get(`${cacheKey}:${page}`);
      if (hit) seeded[page] = hit;
    });
    setRendered(seeded);
  }, [cacheKey, dims]);

  /** Serial-chain enqueue: the module renderThumb paints → onDone updates THIS
   *  list's state (the 12.2.C.3 review fix — cache-only updates never re-rendered). */
  const onIntersect = useCallback((pageNumber: number) => {
    renderChain = renderChain.then(() => renderThumb(doc, cacheKey, pageNumber, (dataUrl) => {
      if (mountedRef.current) setRendered((prev) => (prev[pageNumber] === dataUrl ? prev : { ...prev, [pageNumber]: dataUrl }));
    }));
  }, [doc, cacheKey]);

  const setButtonRef = useCallback((page: number) => (el: HTMLElement | null) => {
    if (el) buttonsRef.current.set(page, el);
    else buttonsRef.current.delete(page);
  }, []);

  // ONE observer per list, per-button lazy renders just before entry.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const page = Number((entry.target as HTMLElement).dataset.thumbPage);
        if (Number.isFinite(page) && page >= 1) onIntersect(page);
        observer.unobserve(entry.target);
      }
    }, { root: ioRoot, rootMargin: IO_ROOT_MARGIN });
    for (const el of buttonsRef.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [ioRoot, onIntersect, cacheKey, dims]);

  // Keep the active page's thumb in view (reduced-motion-aware).
  useEffect(() => {
    const el = buttonsRef.current.get(activePage);
    if (el) scrollNearest(el);
  }, [activePage]);

  return (
    <ul className="flex flex-col items-center gap-2" role="list">
      {dims.map((dim, index) => {
        const page = index + 1;
        const dataUrl = rendered[page];
        const active = page === activePage;
        const aspect = dim.width > 0 && dim.height > 0 ? `${dim.width} / ${dim.height}` : '1 / 1.414';
        return (
          <li key={page} className="w-full">
            <button
              type="button"
              ref={setButtonRef(page)}
              data-thumb-page={page}
              data-testid={`${testIdPrefix}-${page}`}
              onClick={() => onGoToPage(page)}
              aria-label={`الصفحة ${page}${active ? ' — الحالية' : ''}`}
              aria-current={active ? 'true' : undefined}
              className={`press flex w-full flex-col items-center rounded-xl border p-1 transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#25C7E8] focus-visible:outline-none ${
                active
                  ? 'border-[#1685F8] bg-white/10 ring-2 ring-[#1685F8]'
                  : 'border-[#1e293b] bg-white/5 hover:bg-white/10'
              }`}
            >
              <span
                className="block w-full overflow-hidden rounded-md bg-white"
                style={{ aspectRatio: aspect }}
              >
                {dataUrl && (
                  <img
                    src={dataUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="block h-full w-full object-contain"
                  />
                )}
              </span>
              <span lang="en" className="pt-0.5 text-[10px] font-bold tabular-nums text-slate-400">
                {page}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
