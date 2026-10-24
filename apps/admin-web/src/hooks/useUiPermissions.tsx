/**
 * useUiPermissions — Push 3 / Track 3 state layer for the advanced UI permissions.
 *
 * App owns the state via useUiPermissionsBundle(token, isSuperAdmin) and wraps the
 * authenticated shell in <UiPermissionsProvider value={bundleState}>. Consumers
 * (the gated centers) call useUiPermissions() and use its can() helper.
 *
 * can() FAILS OPEN while the bundle is loading or after a fetch error: the cosmetic
 * frontend layer must never lock an administrator out — the API's [Authorize] policies
 * and CanManageAsync checks are the real security boundary (see lib/uiPermissions.ts).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/api';
import {
  ALL_UI_KEYS,
  UI_PERMISSIONS_REGISTRY_VERSION,
  createCanFunction,
  type UiPermissionsBundle,
} from '../lib/uiPermissions';

export type UiPermissionsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; bundle: UiPermissionsBundle }
  | { phase: 'error' };

/**
 * Resolves the effective UI permissions of the current admin.
 * super_admin short-circuits to a synthesized full-access bundle (no request needed).
 */
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

type UiPermissionsContextValue = {
  phase: UiPermissionsState['phase'];
  bundle: UiPermissionsBundle | null;
  can: (key: string) => boolean;
};

const UiPermissionsContext = createContext<UiPermissionsContextValue | null>(null);

export function UiPermissionsProvider({ value, children }: { value: UiPermissionsState; children: React.ReactNode }) {
  const bundle = value.phase === 'ready' ? value.bundle : null;
  const can = useMemo(() => createCanFunction(bundle), [bundle]);

  // Drift detection: compare the backend's allKeys/registryVersion against the local mirror.
  const warnedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!bundle) return;
    const driftKey = `${bundle.registryVersion}|${bundle.allKeys.join(',')}`;
    if (warnedFor.current === driftKey) return;
    const sameVersion = bundle.registryVersion === UI_PERMISSIONS_REGISTRY_VERSION;
    const sameKeys =
      bundle.allKeys.length === ALL_UI_KEYS.length && bundle.allKeys.every((key, index) => key === ALL_UI_KEYS[index]);
    if (!sameVersion || !sameKeys) {
      warnedFor.current = driftKey;
      console.warn(
        '[ui-permissions] drift detected between the backend registry and the frontend mirror — update src/lib/uiPermissions.ts',
        { backendVersion: bundle.registryVersion, mirrorVersion: UI_PERMISSIONS_REGISTRY_VERSION, backendAllKeys: bundle.allKeys },
      );
    }
  }, [bundle]);

  const contextValue = useMemo<UiPermissionsContextValue>(
    () => ({ phase: value.phase, bundle, can }),
    [value.phase, bundle, can],
  );
  return <UiPermissionsContext.Provider value={contextValue}>{children}</UiPermissionsContext.Provider>;
}

export function useUiPermissions(): UiPermissionsContextValue {
  const context = useContext(UiPermissionsContext);
  if (!context) {
    throw new Error('useUiPermissions must be used within <UiPermissionsProvider> (App wraps the authenticated shell).');
  }
  return context;
}
