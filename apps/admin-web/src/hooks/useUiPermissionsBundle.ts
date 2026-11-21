/**
 * useUiPermissionsBundle — W23.3 (A2) split from hooks/useUiPermissions.tsx.
 *
 * Plain module (no JSX): resolves the effective UI permissions of the current
 * admin. super_admin short-circuits to a synthesized full-access bundle (no
 * request needed).
 *
 * can() FAILS OPEN while the bundle is loading or after a fetch error: the
 * cosmetic frontend layer must never lock an administrator out — the API's
 * [Authorize] policies and CanManageAsync checks are the real security
 * boundary (see lib/uiPermissions.ts).
 */
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../lib/api';
import {
  ALL_UI_KEYS,
  UI_PERMISSIONS_REGISTRY_VERSION,
  type UiPermissionsBundle,
} from '../lib/uiPermissions';

export type UiPermissionsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; bundle: UiPermissionsBundle }
  | { phase: 'error' };

export function useUiPermissionsBundle(token: string, isSuperAdmin: boolean): UiPermissionsState {
  const [state, setState] = useState<UiPermissionsState>({ phase: 'idle' });

  useEffect(() => {
    if (!token) {
      setState({ phase: 'idle' });
      return;
    }
    if (isSuperAdmin) {
      // super_admin is never configurable — synthesize the envelope locally.
      setState({
        phase: 'ready',
        bundle: {
          mode: 'super_admin',
          isSuperAdmin: true,
          registryVersion: UI_PERMISSIONS_REGISTRY_VERSION,
          allKeys: [...ALL_UI_KEYS],
          allowedKeys: [...ALL_UI_KEYS],
        },
      });
      return;
    }

    let cancelled = false;
    setState({ phase: 'loading' });
    fetch(`${API_BASE_URL}/api/v1/auth/admin/me/ui-permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`me/ui-permissions failed with ${response.status}`);
        const bundle = (await response.json()) as UiPermissionsBundle;
        if (!cancelled) setState({ phase: 'ready', bundle });
      })
      .catch(() => {
        // Fail-open: can() stays permissive; backend RBAC is the real gate.
        if (!cancelled) setState({ phase: 'error' });
      });
    return () => { cancelled = true; };
  }, [token, isSuperAdmin]);

  return state;
}
