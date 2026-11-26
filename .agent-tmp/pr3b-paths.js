#!/usr/bin/env node
/**
 * PR-3-B runtime path verification — every `t(locale, 'questions.…')` path
 * referenced from the migrated components must resolve to a complete
 * bilingual entry in questionsDict (the `t` fallback would otherwise render
 * the raw path). Also reports the exact entry count.
 */
const fs = require('fs');

const root = '/home/z/cms-platform-manus/apps/admin-web';
const { questionsDict } = require('/home/z/cms-platform-manus/.agent-tmp/questions.cjs');

function walk(node, prefix, out) {
  for (const key of Object.keys(node)) {
    const child = node[key];
    const p = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && 'ar' in child && 'en' in child) {
      out.set(p, child);
    } else if (child && typeof child === 'object') {
      walk(child, p, out);
    }
  }
}

const entries = new Map();
walk(questionsDict, 'questions', entries);
console.log(`questions dictionary entries: ${entries.size}`);

// Template-path prefixes rendered via `t(locale, \`questions.editor.tabs.${tab}\`)`.
const dynamicTabs = ['content', 'explanation', 'classification', 'settings']
  .map((k) => `questions.editor.tabs.${k}`);

const sources = [
  'src/components/QuestionsCenter.tsx',
  'src/components/QuestionImportModal.tsx',
  'src/lib/questionLabels.ts',
];
const referenced = new Set();
for (const f of sources) {
  const src = fs.readFileSync(`${root}/${f}`, 'utf8');
  for (const m of src.matchAll(/'((?:questions|rowError)\.[a-zA-Z0-9.]+)'/g)) {
    referenced.add(m[1]);
  }
}
for (const p of dynamicTabs) referenced.add(p);

let bad = 0;
for (const p of [...referenced].sort()) {
  if (!entries.has(p)) {
    console.log(`UNRESOLVED PATH: ${p}`);
    bad++;
  }
}
console.log(bad === 0
  ? `OK — all ${referenced.size} referenced paths resolve to complete bilingual entries.`
  : `FAIL — ${bad} unresolved path(s).`);
process.exit(bad === 0 ? 0 : 1);
