import { useEffect, useRef } from 'react';
import { variantForReason, type DenialVariant } from '../services/courses-api';

/**
 * Wave 18.4 (D-30) — the ONE `cms-entitlement-error` listener, extracted from
 * the four copies that used to live in CoursesCatalog / LibraryHub /
 * PracticeCatalog / ExamsCatalogPage (each with its own drift risk).
 *
 * Contract (unchanged from the R62/R69 originals):
 *  • a 403 from POST /entitlements/issue can ONLY mean "no active grants" →
 *    the no-subscription variant, regardless of the surface;
 *  • a 403 from a URL this surface `ownsUrl` → the reason-classified variant;
 *  • everything else (other surfaces' 403s) is ignored.
 *
 * `ignoreWhile` lets a surface skip events while its own fetch is in flight
 * (the CoursesCatalog in-queryFn self-heal owns that window).
 */
export function useEntitlementDeniedListener(
  ownsUrl: (url: string) => boolean,
  onDenied: (variant: DenialVariant) => void,
  options?: { ignoreWhile?: () => boolean },
) {
  // Mount-only subscription; live callbacks via refs (no re-subscribe churn).
  const ownsRef = useRef(ownsUrl);
  const deniedRef = useRef(onDenied);
  const ignoreRef = useRef(options?.ignoreWhile);
  useEffect(() => {
    ownsRef.current = ownsUrl;
    deniedRef.current = onDenied;
    ignoreRef.current = options?.ignoreWhile;
  });

  useEffect(() => {
    const onEntitlementError = (event: Event) => {
      if (ignoreRef.current?.()) return;
      const detail = (event as CustomEvent<{ url?: string; reason?: string }>).detail;
      if (!detail?.url) return;
      // R69 §2.B/§2.D — an /entitlements/issue 403 is always "no active grants".
      if (detail.url.includes('/entitlements/issue')) {
        deniedRef.current('no-grants');
        return;
      }
      if (ownsRef.current(detail.url)) {
        deniedRef.current(variantForReason(detail.reason));
      }
    };
    window.addEventListener('cms-entitlement-error', onEntitlementError);
    return () => window.removeEventListener('cms-entitlement-error', onEntitlementError);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);
}
