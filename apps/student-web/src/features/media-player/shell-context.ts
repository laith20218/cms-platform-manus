import { createContext, useContext } from 'react';

/**
 * Push 10.2 — Bridge between the PlayerShell and the players it hosts.
 *
 * The fullscreen button inside player controls must trigger the SHELL's
 * fullscreen (so header/close/controls stay visible), never the media
 * element's. The shell exposes its toggle through this context; a player
 * used outside a shell falls back to its own container fullscreen.
 */
export interface PlayerShellApi {
  /** Requests shell fullscreen ON/OFF. Resolves false when the Fullscreen API
   * is unavailable on this platform (caller may fall back to the video
   * element's native fullscreen, e.g. iPhone Safari). */
  toggleFullscreen: () => Promise<boolean>;
  /** Live fullscreen state (synced via the fullscreenchange event). */
  isFullscreen: boolean;
  /** Wave 12.3.A (A.5) — focus mode asks the SHELL to collapse its header
   * chrome (title/badge/fullscreen/close) with the same keep-mounted
   * animation the player's own bars use. Optional: players outside a shell
   * (or pre-12.3 hosts) never call it — the header stays untouched. */
  setChromeHidden?: (hidden: boolean) => void;
}

export const PlayerShellContext = createContext<PlayerShellApi | null>(null);

export function usePlayerShell(): PlayerShellApi | null {
  return useContext(PlayerShellContext);
}
