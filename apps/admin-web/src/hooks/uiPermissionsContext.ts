/**
 * uiPermissionsContext — W23.3 (A2) split from hooks/useUiPermissions.tsx.
 *
 * Plain module (no JSX): the React context + the consumer hook. Extracted so
 * the provider's .tsx file exports ONLY the component (react-refresh/only-
 * components) while the canonical context/consumer stay shared.
 */
import { createContext, useContext } from 'react';
import type { UiPermissionsBundle } from '../lib/uiPermissions';
import type { UiPermissionsState } from './useUiPermissionsBundle';

export type UiPermissionsContextValue = {
  phase: UiPermissionsState['phase'];
  bundle: UiPermissionsBundle | null;
  can: (key: string) => boolean;
};

export const UiPermissionsContext = createContext<UiPermissionsContextValue | null>(null);

export function useUiPermissions(): UiPermissionsContextValue {
  const context = useContext(UiPermissionsContext);
  if (!context) {
    throw new Error('useUiPermissions must be used within <UiPermissionsProvider> (App wraps the authenticated shell).');
  }
  return context;
}
