import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import { getOrCreateInstallationId } from '@/utils';

/**
 * Push 10.2 — Student media API (mirrors CMS.Api MediaController, Push 10.0).
 *
 * Asset addressing: `{assetType}/{assetId}` where assetType is one of
 * 'library-file' | 'course-episode'. Every call rides the axios client
 * (auth + refresh interceptors, X-Installation-Id attached globally) plus
 * the signed entitlement header (X-Entitlement) required by the
 * /access-style gate.
 */

export type MediaAssetType = 'library-file' | 'course-episode';

/** POST {assetType}/{assetId}/playback-url — camelCase JSON from ASP.NET Core. */
export interface PlaybackUrlInfo {
  url: string;
  ttlSeconds: number;
  expiresAt: string;
  contentType: string;
  supportsRange: boolean;
  /** Push 11.3 — episode favorite state (player star button initial state). False for
   *  library files (their favorite state rides the library list DTO instead). */
  isFavorite?: boolean;
}

export interface MediaBookmark {
  id: string;
  assetType: string;
  assetId: string;
  startSeconds: number;
  endSeconds: number;
  label: string;
  note?: string | null;
  createdAt: string;
}

export interface PlaybackProgress {
  assetType: string;
  assetId: string;
  lastPositionSeconds: number;
  durationSeconds?: number | null;
  completionPercent?: number | null;
  updatedAt: string;
}

function mediaPath(assetType: MediaAssetType, assetId: string): string {
  return `/media/${assetType}/${assetId}`;
}

export const mediaApi = {
  /** Short-lived presigned GET URL (Range-capable object-storage host). */
  getPlaybackUrl: async (assetType: MediaAssetType, assetId: string): Promise<PlaybackUrlInfo> => {
    const res = await apiClient.post<PlaybackUrlInfo>(
      `${mediaPath(assetType, assetId)}/playback-url`,
      undefined,
      await entitlementRequestConfig(),
    );
    return res.data;
  },

  /** Resume position; 204 No Content (no record yet) maps to null. */
  getProgress: async (assetType: MediaAssetType, assetId: string): Promise<PlaybackProgress | null> => {
    const res = await apiClient.get<PlaybackProgress>(
      `${mediaPath(assetType, assetId)}/progress`,
      await entitlementRequestConfig(),
    );
    return res.status === 204 ? null : res.data;
  },

  /** Resume-position upsert (completion is derived server-side — 95% rule). */
  upsertProgress: async (
    assetType: MediaAssetType,
    assetId: string,
    positionSeconds: number,
    durationSeconds: number | null,
  ): Promise<PlaybackProgress> => {
    const res = await apiClient.post<PlaybackProgress>(
      `${mediaPath(assetType, assetId)}/progress`,
      { positionSeconds: Math.max(0, Math.round(positionSeconds)), durationSeconds },
      await entitlementRequestConfig(),
    );
    return res.data;
  },

  /**
   * Fire-and-forget final save for unmount/unload paths: `fetch` + keepalive
   * survives page teardown, and the axios instance cannot be awaited there.
   * Headers mirror the axios interceptors (Bearer + entitlement + installation).
   */
  upsertProgressKeepalive: (
    assetType: MediaAssetType,
    assetId: string,
    positionSeconds: number,
    durationSeconds: number | null,
  ): void => {
    try {
      const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
      const token = sessionStorage.getItem('cms-access-token');
      const entitlement = sessionStorage.getItem('cms-signed-entitlement');
      const installationId = getOrCreateInstallationId();
      void fetch(`${base}${mediaPath(assetType, assetId)}/progress`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': 'ar',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(entitlement ? { 'X-Entitlement': entitlement } : {}),
          'X-Installation-Id': installationId,
          'X-Device-Fingerprint': installationId,
        },
        body: JSON.stringify({
          positionSeconds: Math.max(0, Math.round(positionSeconds)),
          durationSeconds,
        }),
      }).catch(() => { /* best-effort by contract */ });
    } catch { /* best-effort by contract */ }
  },

  /** List the caller's bookmarks for an asset, ordered by StartSeconds
   *  (server-side ordering). 204 is not part of this route's contract — an
   *  empty list arrives as `[]`. */
  listBookmarks: async (assetType: MediaAssetType, assetId: string): Promise<MediaBookmark[]> => {
    const res = await apiClient.get<MediaBookmark[]>(
      `${mediaPath(assetType, assetId)}/bookmarks`,
      await entitlementRequestConfig(),
    );
    return Array.isArray(res.data) ? res.data : [];
  },

  /** Create a labeled clip bookmark. Returns the bookmark + the raw response
   * headers (X-Duration-Warning: unknown tells the client the asset duration
   * was not known server-side when the window was validated). */
  createBookmark: async (
    assetType: MediaAssetType,
    assetId: string,
    input: { startSeconds: number; endSeconds: number; label: string; note?: string | null },
  ): Promise<{ bookmark: MediaBookmark; durationWarning: string | null }> => {
    const res = await apiClient.post<MediaBookmark>(
      `${mediaPath(assetType, assetId)}/bookmarks`,
      {
        startSeconds: Math.max(0, Math.round(input.startSeconds)),
        endSeconds: Math.max(0, Math.round(input.endSeconds)),
        label: input.label,
        note: input.note ?? null,
      },
      await entitlementRequestConfig(),
    );
    const warning = (res.headers?.['x-duration-warning'] as string | undefined) ?? null;
    return { bookmark: res.data, durationWarning: warning };
  },
};
