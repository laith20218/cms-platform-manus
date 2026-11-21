import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FavoriteCard } from '@/features/favorites/components/FavoriteCard';
import type { FavoriteItem } from '@/features/favorites/types';

/**
 * W22.2 — student-facing processing-status labels + copy hygiene (R-05).
 *
 * Recon result this wave closes:
 *  • Every student surface that renders a course/video processing status is
 *    ALREADY Arabic: the favorites card (this file locks it) and the C2
 *    CoursePlayerPage gate (locked by my-studies.test.tsx — untouched, C2).
 *  • No non-C2 surface leaks the raw enum.
 *
 * Locks:
 *  1. The status→label map on the CANONICAL wire values (JsonStringEnumConverter
 *     casing): Pending and every Transcoding_* rung → «قيد المعالجة»,
 *     Failed → «تعذّر المعالجة» (with the recheck affordance), Ready → NO badge
 *     and an enabled open action.
 *  2. The raw wire value never leaks into the student DOM.
 *  3. The FavoriteCard source carries the unified spellings (no bare «تعذر»,
 *     no «جاري») — the W18.5 D-26 glossary extended to the status surface.
 */

function episodeWithStatus(status: string): FavoriteItem {
  return {
    id: 'f1', targetType: 'episode', targetId: 'ep1', subjectId: 's1', courseId: 'c1',
    title: 'محاضرة الفيديو', subtitle: 'تشريح مرضي', thumbnailUrl: null, fileType: 'video',
    durationSeconds: 600, processingStatus: status, createdAt: '2026-01-01', progress: null,
  };
}

function renderCard(item: FavoriteItem) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/favorites']}>
        <Routes>
          <Route path="/favorites" element={<FavoriteCard item={item} onDelete={vi.fn()} deletePending={false} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('W22.2 — student processing-status label map (canonical wire values)', () => {
  it('Pending → «قيد المعالجة», open disabled, no recheck affordance', () => {
    renderCard(episodeWithStatus('Pending'));
    expect(screen.getByTestId('favorite-card-episode')).toHaveTextContent('قيد المعالجة');
    expect(screen.getByTestId('favorite-open')).toBeDisabled();
    expect(screen.queryByTestId('favorite-recheck')).toBeNull();
  });

  it('Transcoding_720p → «قيد المعالجة» (the whole transcoding family)', () => {
    renderCard(episodeWithStatus('Transcoding_720p'));
    expect(screen.getByTestId('favorite-card-episode')).toHaveTextContent('قيد المعالجة');
    expect(screen.getByTestId('favorite-open')).toBeDisabled();
  });

  it('Failed → «تعذّر المعالجة» with the recheck affordance (not a dead end)', () => {
    renderCard(episodeWithStatus('Failed'));
    expect(screen.getByTestId('favorite-card-episode')).toHaveTextContent('تعذّر المعالجة');
    expect(screen.getByTestId('favorite-recheck')).toHaveTextContent('إعادة التحقق');
  });

  it('Ready → no badge at all and the open action is enabled', () => {
    renderCard(episodeWithStatus('Ready'));
    const card = screen.getByTestId('favorite-card-episode');
    expect(card).not.toHaveTextContent('قيد المعالجة');
    expect(card).not.toHaveTextContent('تعذّر المعالجة');
    expect(screen.queryByTestId('favorite-recheck')).toBeNull();
    expect(screen.getByTestId('favorite-open')).toBeEnabled();
  });

  it('the raw wire value never leaks into the student DOM', () => {
    for (const status of ['Pending', 'Transcoding_720p', 'Ready', 'Failed']) {
      const { unmount } = renderCard(episodeWithStatus(status));
      for (const raw of ['Pending', 'Transcoding', 'Ready', 'Failed']) {
        expect(document.body.textContent, `raw enum leak (${status}): ${raw}`).not.toContain(raw);
      }
      unmount();
    }
  });
});

describe('W22.2 — glossary lock on the status surface (D-26 extension)', () => {
  it('FavoriteCard.tsx carries the unified spellings (no bare تعذر, no جاري)', () => {
    const content = readFileSync(
      resolve(__dirname, '../features/favorites/components/FavoriteCard.tsx'),
      'utf-8',
    );
    expect(content.includes('تعذر'), 'bare تعذر').toBe(false);
    expect(content.includes('جاري'), 'جاري').toBe(false);
  });
});
