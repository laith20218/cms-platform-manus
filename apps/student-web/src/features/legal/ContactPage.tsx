/**
 * Wave 16.5 — the Contact page: a NEW public route (/contact) served from the
 * admin-managed content store (GET /content/contact). The admin-web editor
 * (ContentCenter) owns the actual contact details; the seed ships a neutral
 * stub the admin personalizes after deploy.
 */
import { ContentPageView } from './ContentPageView';

export function ContactPage() {
  return <ContentPageView slug="contact" fallbackTitle="تواصل معنا" />;
}
export { ContactPage as default } from './ContactPage';
