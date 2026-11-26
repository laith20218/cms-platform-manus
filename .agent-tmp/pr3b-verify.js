#!/usr/bin/env node
/**
 * PR-3-B verification — byte-identity check.
 *
 * 1. Extract every string literal from the ORIGINAL (git HEAD) versions of
 *    QuestionsCenter.tsx / QuestionImportModal.tsx / questionLabels.ts.
 * 2. Extract every string literal from the NEW working-tree versions of those
 *    files PLUS the new dictionary section (questions.ts).
 * 3. Report any original string that is no longer present byte-for-byte.
 */
const { execSync } = require('child_process');
const fs = require('fs');

const root = '/home/z/cms-platform-manus/apps/admin-web';
const files = [
  'src/components/QuestionsCenter.tsx',
  'src/components/QuestionImportModal.tsx',
  'src/lib/questionLabels.ts',
];

function extractStrings(source) {
  const out = new Set();
  for (const m of source.matchAll(/'([^'\n]*)'/g)) out.add(m[1]);
  for (const m of source.matchAll(/"([^"\n]*)"/g)) out.add(m[1]);
  return out;
}

function extractTemplateFragments(source) {
  const frags = [];
  for (const m of source.matchAll(/`([^`]*)`/g)) {
    for (const part of m[1].split(/\$\{[^}]*\}/g)) {
      if (part.length > 1) frags.push(part);
    }
  }
  return frags;
}

const originalStrings = new Set();
const originalFragments = [];
for (const f of files) {
  const src = execSync(`git -C ${root} show HEAD:./${f}`, { encoding: 'utf8' });
  for (const s of extractStrings(src)) originalStrings.add(s);
  originalFragments.push(...extractTemplateFragments(src));
}

const newStrings = new Set();
const newFragments = [];
// questions.ts (new dictionary section) + statuses.ts (the registry that now
// owns the questionType/questionDifficulty glossary via lib/questionLabels).
for (const f of [...files, 'src/lib/dictionary/questions.ts', 'src/lib/dictionary/statuses.ts']) {
  const src = fs.readFileSync(`${root}/${f}`, 'utf8');
  for (const s of extractStrings(src)) newStrings.add(s);
  newFragments.push(...extractTemplateFragments(src));
}
const newFlat = [...newStrings, ...newFragments].join('\n');

let missing = 0;
for (const s of originalStrings) {
  if (!newStrings.has(s)) {
    console.log(`MISSING literal: ${JSON.stringify(s)}`);
    missing++;
  }
}
for (const frag of originalFragments) {
  if (!newFlat.includes(frag)) {
    console.log(`MISSING template fragment: ${JSON.stringify(frag)}`);
    missing++;
  }
}
console.log(missing === 0
  ? `OK — all ${originalStrings.size} original literals + ${originalFragments.length} template fragments survive byte-for-byte.`
  : `FAIL — ${missing} missing string(s).`);
process.exit(missing === 0 ? 0 : 1);
