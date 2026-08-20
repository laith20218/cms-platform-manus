import { readFileSync } from 'node:fs';

const [input] = process.argv.slice(2);
if (!input) throw new Error('Usage: node summarize-trivy.mjs <report.json>');

const report = JSON.parse(readFileSync(input, 'utf8'));
const summary = {
  targets: 0,
  vulnerabilities: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
  misconfigurations: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
  secrets: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
  findings: [],
};

for (const result of report.Results ?? []) {
  summary.targets += 1;
  for (const [kind, property] of [
    ['vulnerabilities', 'Vulnerabilities'],
    ['misconfigurations', 'Misconfigurations'],
    ['secrets', 'Secrets'],
  ]) {
    for (const finding of result[property] ?? []) {
      const severity = String(finding.Severity ?? 'UNKNOWN').toUpperCase();
      if (!(severity in summary[kind])) summary[kind][severity] = 0;
      summary[kind][severity] += 1;
      if (severity === 'HIGH' || severity === 'CRITICAL') {
        summary.findings.push({
          kind,
          target: result.Target,
          id: finding.VulnerabilityID ?? finding.ID ?? finding.AVDID ?? 'unknown',
          severity,
          title: finding.Title ?? finding.Message ?? 'unnamed finding',
        });
      }
    }
  }
}

console.log(JSON.stringify(summary, null, 2));
