import { apiClient } from '@/services/api-client';

/**
 * Wave 16.5 — public site content (Terms / Privacy / Contact) served by the
 * API's content_pages store instead of hardcoded React components. The pages
 * are readable pre-login (anonymous), so no auth is required.
 */
export interface ContentPageDto {
  slug: string;
  titleAr: string;
  bodyAr: string;
  updatedAt: string;
}

export async function getContentPage(slug: string): Promise<ContentPageDto> {
  const { data } = await apiClient.get(`/content/${slug}`);
  return data as ContentPageDto;
}
