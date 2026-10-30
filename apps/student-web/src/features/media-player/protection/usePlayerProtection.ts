import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Push 10.1 — Player-scoped copy deterrents.
 *
 * Unlike the app-wide `useContentProtection` (SecurityWrapper, page level),
 * this hook is scoped to ONE container: the player surface. While the player
 * is closed (`enabled: false`) the page behaves completely normally — the
 * rest of the app (including admin surfaces) can select, copy and
 * right-click as usual. All listeners are attached in the CAPTURE phase on
 * document/window and only act when the event (or the current text
 * selection) originates inside the guarded container.
 *
 * This is a deterrent against trivial copying, NOT absolute protection:
 * a determined user with devtools can always bypass browser-side guards.
 * The server remains the authorization decision point.
 */

export type PlayerProtectionAction = 'contextmenu' | 'selection' | 'copy' | 'cut' | 'drag' | 'shortcut';

export interface PlayerProtectionOptions {
  /** Master switch — listeners exist only while the player surface is open. */
  enabled?: boolean;
  /** Ctrl/Cmd + key shortcuts intercepted inside the player surface. */
  shortcuts?: readonly string[];
  /**
   * When true, "global" shortcuts (save/print class) are intercepted even if
   * the keydown target is not inside the container. Used by the PlayerShell
   * modal, which covers the whole viewport while open.
   */
  interceptGlobalShortcuts?: boolean;
  /** Fired (throttled per action) whenever a deterrent triggers — for feedback/telemetry. */
  onBlock?: (action: PlayerProtectionAction, label: string) => void;
  /** Throttle window for onBlock, ms. Default 2000. */
  throttleMs?: number;
}

const DEFAULT_SHORTCUTS: readonly string[] = ['c', 's', 'p'];
/** Shortcuts that only make sense page-wide (no selection semantics). */
const GLOBAL_SHORTCUTS: readonly string[] = ['s', 'p'];
const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

function isEditableTarget(node: EventTarget | null): boolean {
  const el = node as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return INPUT_TAGS.includes(el.tagName) || el.isContentEditable === true;
}

/**
 * Wave 11.8 / F2 (supervisor decision D2): the PDF player's text layer is the
 * sanctioned SELECTION surface — selectstart passes through there so the text
 * highlighter can work. Copy/cut/contextmenu deliberately do NOT consult this
 * allowlist: selection without copying is the coherent middle ground between
 * annotating and content extraction.
 */
function isPdfTextLayerTarget(node: EventTarget | null): boolean {
  const el = node as Element | null;
  return typeof el?.closest === 'function' && el.closest('[data-pdf-text-layer]') !== null;
}

export function usePlayerProtection(options: PlayerProtectionOptions = {}): {
  /** Attach to the guarded container element (the player stage). */
  ref: RefObject<HTMLDivElement | null>;
  /**
   * Callback-ref version of `ref`. Hosts that need the same node for other
   * purposes (e.g. the PlayerShell's fullscreen target) should spread THIS
   * into their own callback ref instead of using `ref` directly — it feeds
   * the container node into React state so listener attachment re-runs when
   * portal-delayed mounts (AnimatePresence/Radix) land AFTER the `enabled`
   * flip, not before.
   */
  setContainer: (node: HTMLDivElement | null) => void;
} {
  const {
    enabled = true,
    shortcuts = DEFAULT_SHORTCUTS,
    interceptGlobalShortcuts = false,
    throttleMs = 2000,
  } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  // State mirror of the container node: the portal that hosts the player
  // stage can mount one commit AFTER `enabled` flips true (AnimatePresence),
  // so the effect must re-run when the node actually appears.
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const setContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerNode(node);
  }, []);

  // Keep the callback fresh without re-attaching listeners.
  const onBlockRef = useRef(options.onBlock);
  useEffect(() => {
    onBlockRef.current = options.onBlock;
  });

  useEffect(() => {
    if (!enabled || !containerNode) return;
    const container = containerNode;

    const isInside = (node: Node | EventTarget | null): boolean =>
      node instanceof Node && container.contains(node);

    /** True when the active text selection touches the player surface. */
    const selectionInside = (): boolean => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return false;
      return isInside(selection.anchorNode) || isInside(selection.focusNode);
    };

    const lastFired = new Map<PlayerProtectionAction, number>();
    const feedback = (action: PlayerProtectionAction, label: string) => {
      const now = Date.now();
      if (now - (lastFired.get(action) ?? 0) < throttleMs) return;
      lastFired.set(action, now);
      onBlockRef.current?.(action, label);
    };

    const handleContextMenu = (event: MouseEvent) => {
      // Inputs keep their native menu (paste into transcript boxes etc.).
      if (isEditableTarget(event.target)) return;
      if (!isInside(event.target)) return;
      event.preventDefault();
      feedback('contextmenu', 'قائمة الزر الأيمن معطّلة داخل المشغّل');
    };

    const handleSelectStart = (event: Event) => {
      if (isEditableTarget(event.target) || isPdfTextLayerTarget(event.target)) return;
      if (!isInside(event.target)) return;
      event.preventDefault();
      feedback('selection', 'تحديد النص معطّل داخل المشغّل');
    };

    const handleDragStart = (event: DragEvent) => {
      if (!isInside(event.target)) return;
      event.preventDefault();
      feedback('drag', 'سحب المحتوى معطّل داخل المشغّل');
    };

    const clipboardTargeted = (event: ClipboardEvent | Event): boolean => {
      if (isInside(event.target)) return true;
      // The `copy` event targets the focused element (often <body>) — the
      // reliable signal is where the selection actually lives.
      return selectionInside();
    };

    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!clipboardTargeted(event)) return;
      event.preventDefault();
      feedback('copy', 'النسخ معطّل داخل المشغّل');
    };

    const handleCut = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!clipboardTargeted(event)) return;
      event.preventDefault();
      feedback('cut', 'القص معطّل داخل المشغّل');
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (!shortcuts.includes(key)) return;

      const relevant =
        isInside(event.target) ||
        selectionInside() ||
        (interceptGlobalShortcuts && GLOBAL_SHORTCUTS.includes(key));

      if (!relevant) return;
      // Never swallow shortcuts while a real input inside the player has focus.
      if (isEditableTarget(event.target) && !GLOBAL_SHORTCUTS.includes(key)) return;

      event.preventDefault();
      feedback('shortcut', `الاختصار ${event.ctrlKey ? 'Ctrl' : '⌘'}+${key.toUpperCase()} معطّل داخل المشغّل`);
    };

    // Capture phase: deterrents fire before any child handler can react.
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('selectstart', handleSelectStart, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('cut', handleCut, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('cut', handleCut, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, containerNode, interceptGlobalShortcuts, throttleMs, shortcuts]);

  return { ref: containerRef, setContainer };
}
