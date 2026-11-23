/**
 * W21.1 — pure helpers for the admin Matching (وصل) question editor.
 *
 * Extracted from QuestionsCenter so the validation + payload shaping are
 * unit-testable without rendering the editor (the component keeps only
 * state wiring). The wire contract mirrors the API camelCase DTOs (W20.5):
 *   matching: { prompts: [{id,text,sortOrder}], targets: [...], pairs: [{promptId,targetId}] }
 * with the SAME invariants the domain re-validates server-side: ≥2 items per
 * list, equal counts, non-empty texts, and a bijective pair map.
 */

/** One editable row of either list — the id is a stable CLIENT id (crypto.randomUUID). */
export interface MatchingRow {
  id: string;
  text: string;
}

/** Night Task 7.2 — the numbering styles the API accepts (null = legacy default). */
export type MatchingNumberingStyle = 'digits' | 'arabicLetters' | 'latinLetters';

/** The editor's matching state: two row lists + the pair map (promptId → targetId). */
export interface MatchingFormState {
  prompts: MatchingRow[];
  targets: MatchingRow[];
  /** promptId → targetId; a prompt absent from the map is unpaired. */
  pairs: Record<string, string>;
  /** Night Task 7.1 — multi-map mode: promptId → the SET of correct targets.
   *  Used only when allowMultiMap is on; the single-mode `pairs` map stays the
   *  legacy contract so existing content + tests are untouched. */
  multiPairs?: Record<string, string[]>;
  /** Night Task 7.1 — a left item may be correctly paired with MULTIPLE right items. */
  allowMultiMap?: boolean;
  /** Night Task 7.2 — numbering style per list (undefined = legacy default). */
  promptNumbering?: MatchingNumberingStyle;
  targetNumbering?: MatchingNumberingStyle;
}

/** The wire shape of MatchingPayloadDto (camelCase — W20.5 contract). */
export interface MatchingApiItem {
  id: string;
  text: string;
  sortOrder: number;
}
export interface MatchingApiPair {
  promptId: string;
  targetId: string;
}
export interface MatchingApiPayload {
  prompts: MatchingApiItem[];
  targets: MatchingApiItem[];
  pairs: MatchingApiPair[];
  /** Night Task 7 — optional rules (absent on legacy payloads). */
  allowMultiMap?: boolean;
  promptNumbering?: MatchingNumberingStyle;
  targetNumbering?: MatchingNumberingStyle;
}
/** The `matching` field as it arrives on AdminQuestionDetailDto (W20.5). */
export interface MatchingApiDetail extends MatchingApiPayload {}

/** Stable client id for a new row. crypto.randomUUID in every supported
 *  browser; a getRandomValues UUID-v4 fallback covers test environments
 *  whose jsdom predates randomUUID. */
export function newMatchingRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function row(text: string): MatchingRow {
  return { id: newMatchingRowId(), text };
}

/** A fresh 2×2 board — the minimum the API accepts. */
export function emptyMatching(): MatchingFormState {
  return { prompts: [row(''), row('')], targets: [row(''), row('')], pairs: {}, multiPairs: {} };
}

/** Night Task 7 — the numbering label for a list index, per style.
 *  digits: 1, 2, 3… · arabicLetters: أ ب ج د هـ و ز ح ط ي… · latinLetters: A, B…Z, AA…
 *  (matches the student renderer + the PROMPT_LETTERS legacy default). */
export const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
export function matchingNumberingLabel(index: number, style: MatchingNumberingStyle | null | undefined): string {
  if (style === 'arabicLetters') return ARABIC_LETTERS[index] ?? String(index + 1);
  if (style === 'latinLetters') {
    let n = index;
    let label = '';
    do { label = String.fromCharCode(65 + (n % 26)) + label; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return label;
  }
  return String(index + 1); // digits — also the legacy default for targets
}

/** Toggles one target in a prompt's multi-map selection set (admin checkboxes). */
export function toggleMultiTarget(matching: MatchingFormState, promptId: string, targetId: string): MatchingFormState {
  const current = matching.multiPairs ?? {};
  const selected = current[promptId] ?? [];
  const next = selected.includes(targetId)
    ? selected.filter(id => id !== targetId)
    : [...selected, targetId];
  const multiPairs = { ...current };
  if (next.length > 0) multiPairs[promptId] = next; else delete multiPairs[promptId];
  return { ...matching, multiPairs };
}

export type MatchingValidationCode =
  | 'minItems'
  | 'emptyText'
  | 'unequalCounts'
  | 'unpairedPrompt'
  | 'duplicateTarget';

/** Client-side pre-save validation — Arabic-first admin copy (mirrors the
 *  domain messages so the admin sees the same reason the API would give).
 *  Returns null when the board is saveable. */
export function validateMatching(
  matching: MatchingFormState,
  isArabic: boolean,
): { code: MatchingValidationCode; message: string } | null {
  if (matching.prompts.length < 2 || matching.targets.length < 2) {
    return {
      code: 'minItems',
      message: isArabic
        ? 'سؤال الوصل يتطلب عنصرين على الأقل في كل قائمة.'
        : 'A matching question needs at least two items in each list.',
    };
  }
  const hasEmptyText = [...matching.prompts, ...matching.targets].some(item => !item.text.trim());
  if (hasEmptyText) {
    return {
      code: 'emptyText',
      message: isArabic
        ? 'نص عنصر الوصل لا يمكن أن يكون فارغاً.'
        : 'A matching item cannot have empty text.',
    };
  }

  // ===== Night Task 7.1 — multi-map mode: per-prompt SETS, targets still exclusive =====
  if (matching.allowMultiMap) {
    const multiPairs = matching.multiPairs ?? {};
    if (matching.prompts.some(prompt => (multiPairs[prompt.id] ?? []).length === 0)) {
      return {
        code: 'unpairedPrompt',
        message: isArabic
          ? 'اربط كل عنصر من القائمة الأولى بإجابة صحيحة واحدة على الأقل.'
          : 'Pair every prompt with at least one correct target.',
      };
    }
    const used = matching.prompts.flatMap(prompt => multiPairs[prompt.id] ?? []);
    if (used.length !== new Set(used).size) {
      return {
        code: 'duplicateTarget',
        message: isArabic
          ? 'كل إجابة من القائمة الثانية تبقى صحيحة لعنصر واحد فقط.'
          : 'Every target stays correct for at most one prompt.',
      };
    }
    return null;
  }

  // ===== Legacy single-map bijection (unchanged) =====
  if (matching.prompts.length !== matching.targets.length) {
    return {
      code: 'unequalCounts',
      message: isArabic
        ? `يجب أن يتساوى عدد عناصر القائمتين — حالياً ${matching.prompts.length} مقابل ${matching.targets.length}.`
        : `Both lists must have the same number of items — currently ${matching.prompts.length} vs ${matching.targets.length}.`,
    };
  }
  if (matching.prompts.some(prompt => !matching.pairs[prompt.id])) {
    return {
      code: 'unpairedPrompt',
      message: isArabic
        ? 'اربط كل عنصر من القائمة الأولى بإجابته الصحيحة.'
        : 'Pair every prompt with its correct target.',
    };
  }
  const used = Object.values(matching.pairs);
  if (used.length !== new Set(used).size) {
    return {
      code: 'duplicateTarget',
      message: isArabic
        ? 'كل عنصر من القائمة الثانية يُستخدم مرة واحدة بالضبط — لا يمكن ربط عنصرين بالإجابة نفسها.'
        : 'Every target is used exactly once — two prompts cannot share one answer.',
    };
  }
  return null;
}

/** Shapes the editor state into the create/update wire payload. */
export function matchingToApiPayload(matching: MatchingFormState): MatchingApiPayload {
  const base = {
    prompts: matching.prompts.map((prompt, index) => ({ id: prompt.id, text: prompt.text.trim(), sortOrder: index })),
    targets: matching.targets.map((target, index) => ({ id: target.id, text: target.text.trim(), sortOrder: index })),
  };
  if (matching.allowMultiMap) {
    const multiPairs = matching.multiPairs ?? {};
    const pairs: MatchingApiPair[] = [];
    for (const prompt of matching.prompts) {
      for (const targetId of multiPairs[prompt.id] ?? []) {
        pairs.push({ promptId: prompt.id, targetId });
      }
    }
    return {
      ...base,
      pairs,
      allowMultiMap: true,
      promptNumbering: matching.promptNumbering,
      targetNumbering: matching.targetNumbering,
    };
  }
  return {
    ...base,
    pairs: matching.prompts
      .map(prompt => ({ promptId: prompt.id, targetId: matching.pairs[prompt.id] }))
      .filter((pair): pair is MatchingApiPair => Boolean(pair.targetId)),
    promptNumbering: matching.promptNumbering,
    targetNumbering: matching.targetNumbering,
  };
}

/** Hydrates the editor from AdminQuestionDetailDto.matching (sorted by sortOrder). */
export function matchingFromDetail(detail: MatchingApiDetail | null | undefined): MatchingFormState | null {
  if (!detail || !Array.isArray(detail.prompts) || !Array.isArray(detail.targets)) return null;
  const byOrder = (items: MatchingApiItem[]) =>
    [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const prompts = byOrder(detail.prompts).map(item => ({ id: item.id, text: item.text }));
  const targets = byOrder(detail.targets).map(item => ({ id: item.id, text: item.text }));
  const pairs: Record<string, string> = {};
  const multiPairs: Record<string, string[]> = {};
  for (const pair of detail.pairs ?? []) {
    pairs[pair.promptId] = pair.targetId;
    (multiPairs[pair.promptId] ??= []).push(pair.targetId);
  }
  return {
    prompts,
    targets,
    pairs,
    multiPairs,
    allowMultiMap: detail.allowMultiMap === true,
    promptNumbering: detail.promptNumbering,
    targetNumbering: detail.targetNumbering,
  };
}

/** Removes one prompt row (its pair vanishes with it). */
export function removePrompt(matching: MatchingFormState, promptId: string): MatchingFormState {
  const pairs = { ...matching.pairs };
  delete pairs[promptId];
  const multiPairs = { ...(matching.multiPairs ?? {}) };
  delete multiPairs[promptId];
  return { ...matching, prompts: matching.prompts.filter(prompt => prompt.id !== promptId), pairs, multiPairs };
}

/** Removes one target row — any pair pointing at it is cleared (never dangles). */
export function removeTarget(matching: MatchingFormState, targetId: string): MatchingFormState {
  const pairs = { ...matching.pairs };
  for (const [promptId, paired] of Object.entries(pairs)) {
    if (paired === targetId) delete pairs[promptId];
  }
  const multiPairs: Record<string, string[]> = {};
  for (const [promptId, selected] of Object.entries(matching.multiPairs ?? {})) {
    const kept = selected.filter(id => id !== targetId);
    if (kept.length > 0) multiPairs[promptId] = kept;
  }
  return { ...matching, targets: matching.targets.filter(target => target.id !== targetId), pairs, multiPairs };
}

/** The ids every OTHER prompt already claimed — used to disable those options
 *  in each prompt's target select (bijection enforced at input time). */
export function takenTargetIds(matching: MatchingFormState, exceptPromptId: string): Set<string> {
  const taken = new Set<string>();
  for (const [promptId, targetId] of Object.entries(matching.pairs)) {
    if (promptId !== exceptPromptId && targetId) taken.add(targetId);
  }
  return taken;
}
