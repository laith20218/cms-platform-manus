#!/usr/bin/env node
/**
 * PR-3 — legacy-string inventory for the Admin Web localization migration.
 *
 * Scans apps/admin-web/src for the two legacy bilingual-string patterns the
 * PR-3 migration eliminates:
 *   1. `isArabic ? 'X' : 'Y'` ternaries — classified into:
 *        dir        — direction attributes (`'rtl' : 'ltr'`) — LEGITIMATE keep
 *        localeTag  — Intl/constructor locale tags (`'ar' : 'en'`, `'ar-SY' : 'en'`) — keep
 *        langSwitch — language toggle value (`'en' : 'ar'`) — keep
 *        data       — API data-field selections (nameAr/nameEn, labelAr/labelEn,
 *                     scope.ar/en, module.labelAr …) — keep (data, not UI copy)
 *        icon       — RTL chevron/icon swaps — keep
 *        string     — REMAINING inline bilingual UI strings (the deferred inventory)
 *   2. Hardcoded Arabic-only literals outside the dictionary module
 *      (secondary metric: surfaces that render Arabic regardless of locale).
 *
 * Output: docs/pr-3-legacy-string-inventory.json (machine-readable) + stdout
 * summary. Run from the repo root or apps/admin-web:
 *   node scripts/legacy-string-inventory.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd().includes('apps/admin-web') ? process.cwd() : join(process.cwd(), 'apps/admin-web');
const SRC = join(ROOT, 'src');
const OUT_JSON = join(ROOT, '..', '..', 'docs', 'pr-3-legacy-string-inventory.json');

const TERNARY_RE = /isArabic\s*\?/g;
const DIR_RE = /isArabic\s*\?\s*'rtl'\s*:\s*'ltr'/g;
const LOCALE_TAG_RE = /isArabic\s*\?\s*'(?:ar(?:-SY)?|en)'\s*:\s*'(?:ar(?:-SY)?|en)'/g;
const LANG_SWITCH_RE = /isArabic\s*\?\s*'en'\s*:\s*'ar'/g;
const DATA_FIELD_RE = /isArabic\s*\?\s*[A-Za-z0-9_$.?]*\.?(?:nameAr|nameEn|titleAr|titleEn|labelAr|labelEn|ar|en)\b/g;
const ARABIC_RE = /[\u0600-\u06FF]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function countMatches(text, re) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  return [...text.matchAll(new RegExp(re.source, flags))].length;
}

const files = walk(SRC).filter((f) => !f.includes(join('src', 'lib', 'dictionary')) && !f.includes('dictionary.ts'));

const perFile = [];
let totals = { ternaries: 0, dir: 0, localeTag: 0, langSwitch: 0, data: 0, icon: 0, string: 0, arabicOnly: 0 };

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  const ternaries = countMatches(text, TERNARY_RE);
  if (ternaries === 0 && !lines.some((l) => ARABIC_RE.test(l))) continue;

  const dir = countMatches(text, DIR_RE);
  const localeTag = countMatches(text, LOCALE_TAG_RE);
  const langSwitch = countMatches(text, LANG_SWITCH_RE);
  const data = countMatches(text, DATA_FIELD_RE);
  const icon = countMatches(text, /isArabic\s*\?\s*<Chevron(Left|Right|Down)/g);
  const string = Math.max(0, ternaries - dir - localeTag - langSwitch - data - icon);

  // Arabic-only literals: lines containing Arabic but no `t(` call and not
  // inside the dictionary module. Rough secondary metric (single-line scan).
  const arabicOnly = lines.filter((line) =>
    ARABIC_RE.test(line) && !/\bt\(\s*locale/.test(line) && !/\bdictT\(/.test(line),
  ).length;

  const entry = {
    file: relative(ROOT, file),
    ternaries,
    classification: { dir, localeTag, langSwitch, data, icon, string },
    arabicOnlyLines: arabicOnly,
  };
  perFile.push(entry);
  totals.ternaries += ternaries;
  totals.dir += dir;
  totals.localeTag += localeTag;
  totals.langSwitch += langSwitch;
  totals.data += data;
  totals.icon += icon;
  totals.string += string;
  totals.arabicOnly += arabicOnly;
}

perFile.sort((a, b) => b.classification.string - a.classification.string || b.ternaries - a.ternaries);

const report = {
  generatedAt: new Date().toISOString(),
  pr: 'PR-3 — localization/dictionary adoption',
  scope: 'apps/admin-web/src (dictionary module excluded — it is the source)',
  methodology: [
    'ternaries: occurrences of `isArabic ?` (JSX, object literals, helpers)',
    'dir/localeTag/langSwitch/icon/data: LEGITIMATE non-string uses (direction, Intl tags, toggle, RTL icons, API data fields) — retained by design',
    'string: inline bilingual UI strings remaining inline — the deferred inventory',
    'arabicOnlyLines: lines with Arabic literals not routed through t(locale,…) — secondary heuristic (includes comments)',
  ],
  totals,
  files: perFile,
};

const outDir = join(OUT_JSON, '..');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`\nPR-3 legacy-string inventory — ${perFile.length} files scanned`);
console.log('='.repeat(72));
console.log(`isArabic ternaries total : ${totals.ternaries}`);
console.log(`  dir (rtl/ltr)          : ${totals.dir}   [keep]`);
console.log(`  Intl locale tags       : ${totals.localeTag}   [keep]`);
console.log(`  language switch        : ${totals.langSwitch}   [keep]`);
console.log(`  RTL icon swaps         : ${totals.icon}   [keep]`);
console.log(`  API data fields        : ${totals.data}   [keep]`);
console.log(`  INLINE STRINGS LEFT    : ${totals.string}   [deferred inventory]`);
console.log(`Arabic-only lines        : ${totals.arabicOnly}   [secondary metric]`);
console.log('='.repeat(72));
if (totals.string > 0) {
  console.log('\nFiles with remaining inline bilingual strings:');
  for (const f of perFile.filter((x) => x.classification.string > 0)) {
    console.log(`  ${f.file}: ${f.classification.string} string ternaries / ${f.ternaries} total`);
  }
} else {
  console.log('\nNo inline bilingual UI strings remain outside the dictionary.');
}
console.log(`\nWrote ${relative(process.cwd(), OUT_JSON)}`);
