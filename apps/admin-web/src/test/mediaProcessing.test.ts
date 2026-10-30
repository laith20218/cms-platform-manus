/**
 * R22.5 — the five literal PDF timeline steps + the health badge.
 *
 * Locks the task-book contract the admin upload panel renders:
 *  • pdfTimelineSteps — the 5 rungs (upload / structure / fonts / quality /
 *    ready) derive their done|active|failed|pending states from the pipeline
 *    position, including the brief step-4 beat (qualityChecking) and the
 *    Failed flip («تعذر معالجة الملف ❌» lives in the component, not here).
 *  • pdfHealthBadge — Healthy → green «ملف سليم البنية 100%»,
 *    BrokenArabic → yellow «ملف به مشاكل في النص، تم تفعيل وضع العرض
 *    الاحتياطي», anything else → null (no badge).
 */
import { describe, expect, it } from 'vitest';
import {
  PDF_TIMELINE_STEPS,
  pdfHealthBadge,
  pdfTimelineSteps,
  type PdfStepState,
} from '../lib/mediaProcessing';

const statesOf = (views: ReturnType<typeof pdfTimelineSteps>): Record<string, PdfStepState> =>
  Object.fromEntries(views.map((view) => [view.key, view.state]));

describe('PDF_TIMELINE_STEPS (the 5-step literal ladder)', () => {
  it('exposes exactly the five task-book rungs, in order, never combined', () => {
    expect(PDF_TIMELINE_STEPS.map((step) => step.key)).toEqual([
      'upload',
      'structure',
      'fonts',
      'quality',
      'ready',
    ]);
  });

  it('carries the exact Arabic sentences', () => {
    expect(PDF_TIMELINE_STEPS.map((step) => step.labelAr)).toEqual([
      'جاري رفع الملف...',
      'جاري فحص سلامة الملف...',
      'جاري دمج وإصلاح الخطوط العربية...',
      'جاري تحليل جودة العرض...',
      'جاهز ومتاح للطلاب ✅',
    ]);
  });

  it('keeps the font-embedding sub-text on the fonts rung and rises monotonically', () => {
    expect(PDF_TIMELINE_STEPS[2].subTextAr).toBe('نقوم بدمج الخطوط لضمان أفضل جودة للعرض.');
    const progresses = PDF_TIMELINE_STEPS.map((step) => step.progress);
    for (let i = 1; i < progresses.length; i += 1) {
      expect(progresses[i]).toBeGreaterThan(progresses[i - 1]);
    }
  });
});

describe('pdfTimelineSteps — the state machine', () => {
  it('step 1 spins while the local XHR runs; the rest wait', () => {
    expect(statesOf(pdfTimelineSteps({ uploadInFlight: true, status: null, qualityChecking: false }))).toEqual({
      upload: 'active',
      structure: 'pending',
      fonts: 'pending',
      quality: 'pending',
      ready: 'pending',
    });
  });

  it('after complete-upload the structure check spins (backend Pending / pre-poll)', () => {
    expect(statesOf(pdfTimelineSteps({ uploadInFlight: false, status: 'Pending', qualityChecking: false }))).toEqual({
      upload: 'done',
      structure: 'active',
      fonts: 'pending',
      quality: 'pending',
      ready: 'pending',
    });
    // undefined status right after tracking starts reads the same way.
    expect(statesOf(pdfTimelineSteps({ uploadInFlight: false, status: undefined, qualityChecking: false })))
      .toMatchObject({ structure: 'active', fonts: 'pending' });
  });

  it('Normalizing moves the spinner to the fonts rung with its sub-text', () => {
    const views = pdfTimelineSteps({ uploadInFlight: false, status: 'Normalizing', qualityChecking: false });
    expect(statesOf(views)).toEqual({
      upload: 'done',
      structure: 'done',
      fonts: 'active',
      quality: 'pending',
      ready: 'pending',
    });
    expect(views[2].subTextAr).toBe('نقوم بدمج الخطوط لضمان أفضل جودة للعرض.');
  });

  it('Ready + qualityChecking: the quality rung spins briefly, ready still waits', () => {
    expect(statesOf(pdfTimelineSteps({ uploadInFlight: false, status: 'Ready', qualityChecking: true }))).toEqual({
      upload: 'done',
      structure: 'done',
      fonts: 'done',
      quality: 'active',
      ready: 'pending',
    });
  });

  it('settled Ready: every rung done (the badge state)', () => {
    expect(statesOf(pdfTimelineSteps({ uploadInFlight: false, status: 'Ready', qualityChecking: false }))).toEqual({
      upload: 'done',
      structure: 'done',
      fonts: 'done',
      quality: 'done',
      ready: 'done',
    });
  });

  it('Failed marks the fonts rung failed and the ready rung failed', () => {
    expect(statesOf(pdfTimelineSteps({ uploadInFlight: false, status: 'Failed', qualityChecking: false }))).toEqual({
      upload: 'done',
      structure: 'done',
      fonts: 'failed',
      quality: 'pending',
      ready: 'failed',
    });
  });
});

describe('pdfHealthBadge — the Ready-state classification badge', () => {
  it('Healthy renders the green سليم البنية badge', () => {
    const badge = pdfHealthBadge('Healthy');
    expect(badge).not.toBeNull();
    expect(badge?.tone).toBe('Healthy');
    expect(badge?.labelAr).toBe('ملف سليم البنية 100%');
    expect(badge?.className).toContain('emerald');
  });

  it('BrokenArabic renders the yellow fallback-rendering badge', () => {
    const badge = pdfHealthBadge('BrokenArabic');
    expect(badge).not.toBeNull();
    expect(badge?.tone).toBe('BrokenArabic');
    expect(badge?.labelAr).toBe('ملف به مشاكل في النص، تم تفعيل وضع العرض الاحتياطي');
    expect(badge?.className).toContain('amber');
  });

  it('null/unknown/in-flight classifications show NO badge', () => {
    expect(pdfHealthBadge(null)).toBeNull();
    expect(pdfHealthBadge(undefined)).toBeNull();
    expect(pdfHealthBadge('')).toBeNull();
    expect(pdfHealthBadge('Pending')).toBeNull();
    expect(pdfHealthBadge('SomethingElse')).toBeNull();
  });
});
