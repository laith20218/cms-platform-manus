/**
 * Wave 16.5 — Terms of Use, now served from the admin-managed content store
 * (GET /content/terms) instead of a hardcoded component. The admin-web editor
 * (ContentCenter) edits the same row; the migration seeds it with the exact
 * text this page used to hardcode.
 */
import { ContentPageView } from './ContentPageView';

export function TermsPage() {
  return <ContentPageView slug="terms" fallbackTitle="شروط الاستخدام" />;
}
export { TermsPage as default } from './TermsPage';
