import { describe, it, expect } from 'vitest';
import {
  matchingFromDetail,
  matchingNumberingLabel,
  matchingToApiPayload,
  toggleMultiTarget,
  validateMatching,
  type MatchingFormState,
} from '../lib/matchingEditor';

/**
 * Night Task 7 — admin matching rules locks:
 *  7.1 multi-map validation (per-prompt sets, targets stay exclusive) and the
 *      wire payload shape (flattened pairs + allowMultiMap flag);
 *  7.2 numbering styles round-trip + label rendering (digits / Arabic / Latin);
 *  legacy single-map behavior stays byte-identical (covered by
 *  matching-editor.test.ts — these suites are additive).
 */

function multiBoard(overrides: Partial<MatchingFormState> = {}): MatchingFormState {
  return {
    prompts: [
      { id: 'p1', text: 'العصب السابع' },
      { id: 'p2', text: 'العصب الخامس' },
    ],
    targets: [
      { id: 't1', text: 'العضلة الدائرية' },
      { id: 't2', text: 'العضلة الماضغة' },
      { id: 't3', text: 'مموه إضافي' },
    ],
    pairs: {},
    multiPairs: { p1: ['t1', 't2'], p2: ['t3'] },
    allowMultiMap: true,
    ...overrides,
  };
}

describe('Night 7.1 — multi-map validation', () => {
  it('accepts a prompt mapped to multiple targets with an extra distractor target', () => {
    expect(validateMatching(multiBoard(), true)).toBeNull();
  });

  it('rejects a prompt with no target selected (unpairedPrompt)', () => {
    const board = multiBoard({ multiPairs: { p1: ['t1', 't2'] } });
    const result = validateMatching(board, true);
    expect(result?.code).toBe('unpairedPrompt');
    expect(result?.message).toContain('على الأقل');
  });

  it('rejects one target correct for two prompts (duplicateTarget)', () => {
    const board = multiBoard({ multiPairs: { p1: ['t1'], p2: ['t1'] } });
    const result = validateMatching(board, true);
    expect(result?.code).toBe('duplicateTarget');
  });

  it('allows unequal list sizes in multi mode (distractors)', () => {
    const board = multiBoard({ targets: [
      { id: 't1', text: 'أ' }, { id: 't2', text: 'ب' }, { id: 't3', text: 'ج' }, { id: 't4', text: 'د' },
    ] });
    expect(validateMatching(board, true)).toBeNull();
  });
});

describe('Night 7.1 — multi-map wire payload + hydration', () => {
  it('flattens multi selections into the pairs array and carries the flag', () => {
    const payload = matchingToApiPayload(multiBoard());
    expect(payload.allowMultiMap).toBe(true);
    expect(payload.pairs).toEqual([
      { promptId: 'p1', targetId: 't1' },
      { promptId: 'p1', targetId: 't2' },
      { promptId: 'p2', targetId: 't3' },
    ]);
  });

  it('round-trips through matchingFromDetail with rules intact', () => {
    const payload = matchingToApiPayload(multiBoard({ promptNumbering: 'digits', targetNumbering: 'latinLetters' }));
    const restored = matchingFromDetail(payload);
    expect(restored?.allowMultiMap).toBe(true);
    expect(restored?.multiPairs).toEqual({ p1: ['t1', 't2'], p2: ['t3'] });
    expect(restored?.promptNumbering).toBe('digits');
    expect(restored?.targetNumbering).toBe('latinLetters');
  });

  it('legacy single payloads hydrate with allowMultiMap false and a singleton map', () => {
    const restored = matchingFromDetail({
      prompts: [{ id: 'p1', text: 'أ', sortOrder: 0 }, { id: 'p2', text: 'ب', sortOrder: 1 }],
      targets: [{ id: 't1', text: '١', sortOrder: 0 }, { id: 't2', text: '٢', sortOrder: 1 }],
      pairs: [{ promptId: 'p1', targetId: 't2' }, { promptId: 'p2', targetId: 't1' }],
    });
    expect(restored?.allowMultiMap).toBe(false);
    expect(restored?.pairs).toEqual({ p1: 't2', p2: 't1' });
  });

  it('single-mode payload keeps the legacy shape and still carries numbering', () => {
    const payload = matchingToApiPayload({
      prompts: [{ id: 'p1', text: 'أ' }, { id: 'p2', text: 'ب' }],
      targets: [{ id: 't1', text: '١' }, { id: 't2', text: '٢' }],
      pairs: { p1: 't1', p2: 't2' },
      promptNumbering: 'latinLetters',
    });
    expect(payload.allowMultiMap).toBeUndefined();
    expect(payload.pairs).toEqual([{ promptId: 'p1', targetId: 't1' }, { promptId: 'p2', targetId: 't2' }]);
    expect(payload.promptNumbering).toBe('latinLetters');
  });
});

describe('Night 7.2 — numbering labels', () => {
  it('renders digits, Arabic letters, and Latin letters (incl. AA after Z)', () => {
    expect(matchingNumberingLabel(0, 'digits')).toBe('1');
    expect(matchingNumberingLabel(4, 'digits')).toBe('5');
    expect(matchingNumberingLabel(0, 'arabicLetters')).toBe('أ');
    expect(matchingNumberingLabel(4, 'arabicLetters')).toBe('هـ');
    expect(matchingNumberingLabel(0, 'latinLetters')).toBe('A');
    expect(matchingNumberingLabel(25, 'latinLetters')).toBe('Z');
    expect(matchingNumberingLabel(26, 'latinLetters')).toBe('AA');
    // null/undefined = legacy default (digits).
    expect(matchingNumberingLabel(2, undefined)).toBe('3');
    expect(matchingNumberingLabel(9, 'arabicLetters')).toBe('ي');
    expect(matchingNumberingLabel(10, 'arabicLetters')).toBe('11'); // beyond the letters
  });
});

describe('Night 7.1 — toggleMultiTarget', () => {
  it('adds and removes a target from a prompt set without touching others', () => {
    const board = multiBoard();
    const added = toggleMultiTarget(board, 'p2', 't1');
    expect(added.multiPairs?.p2).toEqual(['t3', 't1']);
    const removed = toggleMultiTarget(added, 'p1', 't1');
    expect(removed.multiPairs?.p1).toEqual(['t2']);
    // removing the last selection drops the key entirely
    const noP1 = toggleMultiTarget(removed, 'p1', 't2');
    expect(noP1.multiPairs?.p1).toBeUndefined();
    const emptied = toggleMultiTarget(toggleMultiTarget(noP1, 'p2', 't1'), 'p2', 't3');
    expect(emptied.multiPairs?.p2).toBeUndefined();
  });
});
