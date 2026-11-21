import { describe, it, expect } from 'vitest';
import {
  emptyMatching,
  matchingFromDetail,
  matchingToApiPayload,
  newMatchingRowId,
  removePrompt,
  removeTarget,
  takenTargetIds,
  validateMatching,
  type MatchingFormState,
} from '../lib/matchingEditor';

/**
 * W21.1 — pure helper locks for the admin Matching (وصل) editor:
 *  • validateMatching enforces the API invariants client-side (≥2 rows,
 *    non-empty texts, equal counts, every prompt paired, no reused target);
 *  • matchingToApiPayload emits the exact W20.5 camelCase wire shape
 *    (prompts/targets with sortOrder + a flat pairs array);
 *  • matchingFromDetail round-trips the AdminQuestionDetailDto payload;
 *  • row removal never leaves a dangling pair.
 */

function board(overrides: Partial<MatchingFormState> = {}): MatchingFormState {
  const prompts = overrides.prompts ?? [
    { id: 'p1', text: 'الجرثومة' },
    { id: 'p2', text: 'الفيروس' },
  ];
  const targets = overrides.targets ?? [
    { id: 't1', text: 'خلية حية' },
    { id: 't2', text: 'خلية مضيفة' },
  ];
  const pairs = overrides.pairs ?? { p1: 't2', p2: 't1' };
  return { prompts, targets, pairs };
}

describe('validateMatching — the save gate', () => {
  it('accepts a complete 2×2 board', () => {
    expect(validateMatching(board(), true)).toBeNull();
  });

  it('rejects fewer than two rows on either side (minItems)', () => {
    const onePrompt = board({ prompts: [{ id: 'p1', text: 'أ' }] });
    const result = validateMatching(onePrompt, true);
    expect(result?.code).toBe('minItems');
    expect(result?.message).toContain('عنصرين على الأقل');
  });

  it('rejects empty item text (emptyText)', () => {
    const withBlank = board({
      prompts: [
        { id: 'p1', text: 'الجرثومة' },
        { id: 'p2', text: '   ' },
      ],
    });
    expect(validateMatching(withBlank, true)?.code).toBe('emptyText');
  });

  it('rejects unequal list counts with the live numbers (unequalCounts)', () => {
    const unequal = board({
      prompts: [
        { id: 'p1', text: 'أ' },
        { id: 'p2', text: 'ب' },
        { id: 'p3', text: 'ج' },
      ],
      pairs: {},
    });
    const result = validateMatching(unequal, true);
    expect(result?.code).toBe('unequalCounts');
    expect(result?.message).toContain('3');
  });

  it('rejects an unpaired prompt (unpairedPrompt)', () => {
    const partial = board({ pairs: { p1: 't1' } });
    expect(validateMatching(partial, true)?.code).toBe('unpairedPrompt');
  });

  it('rejects a target reused by two prompts (duplicateTarget) — defense in depth', () => {
    const reused = board({ pairs: { p1: 't1', p2: 't1' } });
    expect(validateMatching(reused, true)?.code).toBe('duplicateTarget');
  });

  it('mirrors the messages in English when the UI is English', () => {
    const result = validateMatching(board({ pairs: {} }), false);
    expect(result?.code).toBe('unpairedPrompt');
    expect(result?.message).toContain('Pair every prompt');
  });
});

describe('matchingToApiPayload — the wire shape (W20.5 contract)', () => {
  it('emits prompts/targets with sortOrder and a flat pairs array', () => {
    const payload = matchingToApiPayload(board());
    expect(payload.prompts).toEqual([
      { id: 'p1', text: 'الجرثومة', sortOrder: 0 },
      { id: 'p2', text: 'الفيروس', sortOrder: 1 },
    ]);
    expect(payload.targets).toEqual([
      { id: 't1', text: 'خلية حية', sortOrder: 0 },
      { id: 't2', text: 'خلية مضيفة', sortOrder: 1 },
    ]);
    expect(payload.pairs).toEqual([
      { promptId: 'p1', targetId: 't2' },
      { promptId: 'p2', targetId: 't1' },
    ]);
  });

  it('trims item texts and drops unpaired prompts from the pairs array', () => {
    const payload = matchingToApiPayload(board({
      prompts: [
        { id: 'p1', text: '  الجرثومة  ' },
        { id: 'p2', text: 'الفيروس' },
      ],
      pairs: { p1: 't1' }, // p2 unpaired → its pair is simply absent
    }));
    expect(payload.prompts[0].text).toBe('الجرثومة');
    expect(payload.pairs).toEqual([{ promptId: 'p1', targetId: 't1' }]);
  });
});

describe('matchingFromDetail — hydrating the editor from the admin detail', () => {
  it('sorts by sortOrder and rebuilds the pair map', () => {
    const hydrated = matchingFromDetail({
      prompts: [
        { id: 'p2', text: 'الفيروس', sortOrder: 1 },
        { id: 'p1', text: 'الجرثومة', sortOrder: 0 },
      ],
      targets: [
        { id: 't2', text: 'خلية مضيفة', sortOrder: 1 },
        { id: 't1', text: 'خلية حية', sortOrder: 0 },
      ],
      pairs: [{ promptId: 'p1', targetId: 't2' }, { promptId: 'p2', targetId: 't1' }],
    });
    expect(hydrated?.prompts.map(prompt => prompt.id)).toEqual(['p1', 'p2']);
    expect(hydrated?.targets.map(target => target.id)).toEqual(['t1', 't2']);
    expect(hydrated?.pairs).toEqual({ p1: 't2', p2: 't1' });
  });

  it('returns null for a missing/malformed payload (caller falls back to a fresh board)', () => {
    expect(matchingFromDetail(null)).toBeNull();
    expect(matchingFromDetail(undefined)).toBeNull();
    expect(matchingFromDetail({ prompts: [], targets: [], pairs: [] })).not.toBeNull();
  });
});

describe('row lifecycle — no dangling pairs', () => {
  it('emptyMatching seeds a blank 2×2 board with distinct client ids and no pairs', () => {
    const seeded = emptyMatching();
    expect(seeded.prompts).toHaveLength(2);
    expect(seeded.targets).toHaveLength(2);
    expect(seeded.pairs).toEqual({});
    const ids = [...seeded.prompts, ...seeded.targets].map(item => item.id);
    expect(new Set(ids).size).toBe(4);
    expect(seeded.prompts.every(prompt => prompt.text === '')).toBe(true);
  });

  it('removing a prompt drops its own pair', () => {
    const next = removePrompt(board(), 'p1');
    expect(next.prompts.map(prompt => prompt.id)).toEqual(['p2']);
    expect(next.pairs).toEqual({ p2: 't1' });
  });

  it('removing a target clears every pair pointing at it', () => {
    const next = removeTarget(board(), 't1');
    expect(next.targets.map(target => target.id)).toEqual(['t2']);
    expect(next.pairs).toEqual({ p1: 't2' }); // p2's pair to t1 is gone
  });

  it('takenTargetIds excludes the asking prompt (its own selection stays selectable)', () => {
    const taken = takenTargetIds(board(), 'p1');
    expect(taken.has('t1')).toBe(true);  // taken by p2
    expect(taken.has('t2')).toBe(false); // p1's own — not "taken"
  });

  it('newMatchingRowId yields distinct ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newMatchingRowId()));
    expect(ids.size).toBe(50);
  });
});
