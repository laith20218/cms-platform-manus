import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';

/**
 * Night Task 7 — student Matching (وصل) rules:
 *  7.1 multi-map: a prompt may carry MULTIPLE selected targets; chips render
 *      per selection with per-chip removal; the correct SET is revealed.
 *  7.2 numbering styles render per list (digits / Arabic letters / Latin).
 * Legacy single-map rendering stays byte-identical (covered by the existing
 * matching suites — these cases are additive).
 */

import {
  matchingNumberingLabel,
  parseMatchingAnswerMulti,
  serializeMatchingAnswerMulti,
  type MatchingStudentPayload,
} from '@/features/questions/services/matching';
import { MatchingQuestion } from '@/components/MatchingQuestion';

const P1 = 'p1';
const P2 = 'p2';
const T1 = 't1';
const T2 = 't2';
const T3 = 't3';

const basePayload = (overrides: Partial<MatchingStudentPayload> = {}): MatchingStudentPayload => ({
  prompts: [
    { id: P1, text: 'العصب السابع', sortOrder: 0 },
    { id: P2, text: 'العصب الخامس', sortOrder: 1 },
  ],
  targets: [
    { id: T1, text: 'العضلة الدائرية', sortOrder: 0 },
    { id: T2, text: 'العضلة الماضغة', sortOrder: 1 },
    { id: T3, text: 'مموه إضافي', sortOrder: 2 },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

/** Controlled-state harness: the board stays in sync with its own emissions. */
function MultiBoard(props: { payload: MatchingStudentPayload; initial?: Record<string, string[]>; onChange?: (pairs: Record<string, string[]>) => void; result?: never }) {
  const [pairs, setPairs] = useState<Record<string, string[]>>(props.initial ?? {});
  return (
    <MatchingQuestion
      payload={props.payload}
      pairs={{}}
      multiPairs={pairs}
      onMultiPairsChange={(next) => { setPairs(next); props.onChange?.(next); }}
      result={props.result ?? null}
      testIdPrefix="t"
      questionId="q1"
    />
  );
}

// ===== 7.1 multi-map interaction =====

describe('MatchingQuestion — multi-map mode', () => {
  it('adds multiple targets to one prompt via click-click toggling', () => {
    const onChange = vi.fn();
    render(<MultiBoard payload={basePayload({ allowMultiMap: true })} onChange={onChange} />);

    fireEvent.click(screen.getByTestId(`t-matching-target-${T1}`));
    fireEvent.click(screen.getByTestId(`t-matching-pairzone-${P1}`));
    expect(onChange).toHaveBeenLastCalledWith({ [P1]: [T1] });
    expect(screen.getByTestId(`t-matching-submitted-${P1}-${T1}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`t-matching-target-${T2}`));
    fireEvent.click(screen.getByTestId(`t-matching-pairzone-${P1}`));
    expect(onChange).toHaveBeenLastCalledWith({ [P1]: [T1, T2] });
    expect(screen.getByTestId(`t-matching-submitted-${P1}-${T2}`)).toBeInTheDocument();
  });

  it('renders one submitted chip per selected target with per-chip removal', () => {
    const onChange = vi.fn();
    render(
      <MatchingQuestion
        payload={basePayload({ allowMultiMap: true })}
        pairs={{}}
        multiPairs={{ [P1]: [T1, T2], [P2]: [T3] }}
        onMultiPairsChange={onChange}
        testIdPrefix="t"
        questionId="q1"
      />,
    );

    expect(screen.getByTestId(`t-matching-submitted-${P1}-${T1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`t-matching-submitted-${P1}-${T2}`)).toBeInTheDocument();
    expect(screen.getByTestId(`t-matching-submitted-${P2}-${T3}`)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'إزالة هذا الربط' })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ [P1]: [T2], [P2]: [T3] });
  });

  it('reveals the correct SET for a wrong prompt after grading', () => {
    render(
      <MatchingQuestion
        payload={basePayload({ allowMultiMap: true })}
        pairs={{}}
        multiPairs={{ [P1]: [T1], [P2]: [T3] }}
        result={{
          isCorrect: false,
          pairs: [{ promptId: P1, submittedTargetId: T1, correctTargetId: T1, isCorrect: false }],
          correctPairs: [
            { promptId: P1, targetId: T1 },
            { promptId: P1, targetId: T2 },
            { promptId: P2, targetId: T3 },
          ],
        }}
        testIdPrefix="t"
        questionId="q1"
      />,
    );
    expect(screen.getByText('الصحيح:', { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId(`t-matching-submitted-${P1}-${T1}`)).toBeInTheDocument();
  });

  it('does not dim targets used by other prompts (a target may be attempted anywhere)', () => {
    render(
      <MatchingQuestion
        payload={basePayload({ allowMultiMap: true })}
        pairs={{}}
        multiPairs={{ [P1]: [T1] }}
        onMultiPairsChange={() => undefined}
        testIdPrefix="t"
        questionId="q1"
      />,
    );
    expect(screen.getByTestId(`t-matching-target-${T2}`).className).not.toContain('opacity-45');
  });
});

// ===== 7.2 numbering styles =====

describe('MatchingQuestion — numbering styles', () => {
  it('renders Arabic letters for prompts and digits for targets by default (legacy)', () => {
    render(
      <MatchingQuestion
        payload={basePayload()}
        pairs={{}}
        onPairsChange={() => undefined}
        testIdPrefix="t"
        questionId="q1"
      />,
    );
    expect(screen.getByTestId('t-matching-pairzone-p1').textContent).toContain('أ');
    expect(screen.getByTestId('t-matching-target-t1').textContent).toContain('1');
  });

  it('renders the admin-selected styles (digits prompts / Latin targets)', () => {
    render(
      <MatchingQuestion
        payload={basePayload({ promptNumbering: 'digits', targetNumbering: 'latinLetters' })}
        pairs={{}}
        onPairsChange={() => undefined}
        testIdPrefix="t"
        questionId="q1"
      />,
    );
    expect(screen.getByTestId('t-matching-pairzone-p1').textContent).toContain('1');
    expect(screen.getByTestId('t-matching-target-t1').textContent).toContain('A');
    expect(screen.getByTestId('t-matching-target-t2').textContent).toContain('B');
  });
});

// ===== serialization round-trip =====

describe('multi-map answer serialization', () => {
  it('flattens sets to the wire pairs array and parses them back', () => {
    const wire = serializeMatchingAnswerMulti({ [P1]: [T1, T2], [P2]: [T3] });
    expect(JSON.parse(wire)).toEqual([
      { promptId: P1, targetId: T1 },
      { promptId: P1, targetId: T2 },
      { promptId: P2, targetId: T3 },
    ]);
    expect(parseMatchingAnswerMulti(wire)).toEqual({ [P1]: [T1, T2], [P2]: [T3] });
  });

  it('yields empty maps for malformed input (never a crash)', () => {
    expect(parseMatchingAnswerMulti(null)).toEqual({});
    expect(parseMatchingAnswerMulti('not json')).toEqual({});
    expect(parseMatchingAnswerMulti('[{"promptId":"x"}]')).toEqual({});
  });

  it('labels digits / Arabic / Latin including AA after Z', () => {
    expect(matchingNumberingLabel(0, 'digits')).toBe('1');
    expect(matchingNumberingLabel(0, 'arabicLetters')).toBe('أ');
    expect(matchingNumberingLabel(4, 'arabicLetters')).toBe('هـ');
    expect(matchingNumberingLabel(25, 'latinLetters')).toBe('Z');
    expect(matchingNumberingLabel(26, 'latinLetters')).toBe('AA');
    expect(matchingNumberingLabel(0, undefined)).toBe('1');
  });
});
