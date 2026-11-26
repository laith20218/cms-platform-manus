#!/usr/bin/env node
/**
 * PR-3-B reverse check — every string in the NEW questions.ts dictionary must
 * trace back byte-for-byte to the ORIGINAL component sources (or be an
 * explicitly allowed exception: newly-authored English for legacy
 * Arabic-only catch fallbacks, Arabic pager defaults mirrored from the
 * Pagination component, or {{token}}-flattened template literals whose static
 * fragments all appear in the originals).
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
    for (const part of m[1].split(/\$\{[^}]*\}/g)) frags.push(part);
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

// Arabic pager defaults come from the Pagination component (packages/ui).
const paginationSrc = fs.readFileSync(
  '/home/z/cms-platform-manus/packages/ui/src/components/Pagination.tsx', 'utf8');
for (const s of extractStrings(paginationSrc)) originalStrings.add(s);
originalFragments.push(...extractTemplateFragments(paginationSrc));

const dictSrc = fs.readFileSync(`${root}/src/lib/dictionary/questions.ts`, 'utf8');

// Newly authored English sides for legacy Arabic-only catch fallbacks.
const allowedEnglish = new Set([
  'Failed to load universities.',
  'Failed to load questions.',
  'Failed to load colleges.',
  'Failed to load academic years.',
  'Failed to load semesters.',
  'Failed to load subjects.',
  'Failed to load lectures.',
  'Failed to open the question.',
  'Failed to save the question.',
  'Failed to update the question status.',
  'Failed to delete the question.',
  'Failed to open the preview.',
  'Failed to duplicate the question.',
  'Failed to apply the bulk action.',
  'Failed to upload the image.',
]);

// Extract "key: { ar: '...', en: '...' }" values from the dictionary.
const entryRe = /(?:\w+):\s*\{\s*ar:\s*'((?:[^'\\\n]|\\.)*)',\s*en:\s*'((?:[^'\\\n]|\\.)*)'\s*\}/g;
let bad = 0;
let count = 0;
for (const m of dictSrc.matchAll(entryRe)) {
  count++;
  for (const raw of [m[1], m[2]]) {
    const value = raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (originalStrings.has(value)) continue;
    if (allowedEnglish.has(value)) continue;
    // token-flattened template: every static fragment must exist
    const frags = value.split(/\{\{\w+\}\}/g);
    const allFragsKnown = frags.every((f) => f === '' || originalFragments.includes(f));
    if (frags.length > 1 && allFragsKnown) continue;
    console.log(`UNTRACEABLE: ${JSON.stringify(value)}`);
    bad++;
  }
}
console.log(bad === 0
  ? `OK — all ${count} dictionary entries trace byte-for-byte to the original sources.`
  : `FAIL — ${bad} untraceable value(s) across ${count} entries.`);
process.exit(bad === 0 ? 0 : 1);
