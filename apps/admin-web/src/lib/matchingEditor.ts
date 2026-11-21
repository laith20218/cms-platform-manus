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

/** The editor's matching state: two row lists + the pair map (promptId → targetId). */
export interface MatchingFormState {
  prompts: MatchingRow[];
  targets: MatchingRow[];
  /** promptId → targetId; a prompt absent from the map is unpaired. */
  pairs: Record<string, string>;
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
  return { prompts: [row(''), row('')], targets: [row(''), row('')], pairs: {} };
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
  return {
    prompts: matching.prompts.map((prompt, index) => ({ id: prompt.id, text: prompt.text.trim(), sortOrder: index })),
    targets: matching.targets.map((target, index) => ({ id: target.id, text: target.text.trim(), sortOrder: index })),
    pairs: matching.prompts
      .map(prompt => ({ promptId: prompt.id, targetId: matching.pairs[prompt.id] }))
      .filter((pair): pair is MatchingApiPair => Boolean(pair.targetId)),
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
  for (const pair of detail.pairs ?? []) pairs[pair.promptId] = pair.targetId;
  return { prompts, targets, pairs };
}

/** Removes one prompt row (its pair vanishes with it). */
export function removePrompt(matching: MatchingFormState, promptId: string): MatchingFormState {
  const pairs = { ...matching.pairs };
  delete pairs[promptId];
  return { ...matching, prompts: matching.prompts.filter(prompt => prompt.id !== promptId), pairs };
}

/** Removes one target row — any pair pointing at it is cleared (never dangles). */
export function removeTarget(matching: MatchingFormState, targetId: string): MatchingFormState {
  const pairs = { ...matching.pairs };
  for (const [promptId, paired] of Object.entries(pairs)) {
    if (paired === targetId) delete pairs[promptId];
  }
  return { ...matching, targets: matching.targets.filter(target => target.id !== targetId), pairs };
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
