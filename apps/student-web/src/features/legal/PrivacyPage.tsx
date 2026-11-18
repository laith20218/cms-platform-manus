/**
 * Wave 16.5 — Privacy Policy, now served from the admin-managed content store
 * (GET /content/privacy) instead of a hardcoded component. The admin-web editor
 * (ContentCenter) edits the same row; the migration seeds it with the exact
 * text this page used to hardcode.
 */
import { ContentPageView } from './ContentPageView';

export function PrivacyPage() {
  return <ContentPageView slug="privacy" fallbackTitle="سياسة الخصوصية" />;
}
export { PrivacyPage as default } from './PrivacyPage';
