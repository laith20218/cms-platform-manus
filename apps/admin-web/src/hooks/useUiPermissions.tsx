/**
 * useUiPermissions — Push 3 / Track 3 state layer for the advanced UI permissions.
 *
 * App owns the state via useUiPermissionsBundle(token, isSuperAdmin) and wraps the
 * authenticated shell in <UiPermissionsProvider value={bundleState}>. Consumers
 * (the gated centers) call useUiPermissions() and use its can() helper.
 *
 * W23.3 (A2): the context/consumer hook now lives in hooks/uiPermissionsContext.ts
 * and the state hook in hooks/useUiPermissionsBundle.ts — this file exports ONLY
 * the provider component (react-refresh/only-export-components clean; HMR keeps
 * working, no behavior change).
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  ALL_UI_KEYS,
  UI_PERMISSIONS_REGISTRY_VERSION,
  createCanFunction,
} from '../lib/uiPermissions';
import { UiPermissionsContext, type UiPermissionsContextValue } from './uiPermissionsContext';
import type { UiPermissionsState } from './useUiPermissionsBundle';

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
