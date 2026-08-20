#!/usr/bin/env python3
"""Read-only static reconciliation of declared React Router paths and literal navigation targets."""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/student-web/src'
ROUTER = WEB / 'app/router.tsx'
OUT = ROOT / 'docs/security'
ROUTE = re.compile(r'<Route\s+path="([^"]+)"')
LITERAL_NAV = re.compile(r'(?:to|navigate|href)\s*(?:=|\()\s*(["\'])(/[^"\']*)\1')
TEMPLATE_NAV = re.compile(r'(?:to|navigate)\s*(?:=|\()\s*\{?`(/[^`]+)`\}?')


def norm(value: str) -> str:
    value = re.sub(r'\$\{[^}]+\}', ':param', value)
    value = re.sub(r'/:[^/]+', '/:param', value)
    return value.rstrip('/') or '/'

routes = [norm(item) for item in ROUTE.findall(ROUTER.read_text(encoding='utf-8'))]
links: list[dict[str, str]] = []
for path in sorted(WEB.rglob('*')):
    if path.suffix not in {'.ts', '.tsx'}:
        continue
    text = path.read_text(encoding='utf-8')
    for pattern in (LITERAL_NAV, TEMPLATE_NAV):
        for match in pattern.finditer(text):
            raw = match.group(2) if pattern is LITERAL_NAV else match.group(1)
            if raw in {'/', '/dashboard'}:
                continue
            links.append({'route': norm(raw), 'source': str(path.relative_to(ROOT)), 'line': str(text.count('\n', 0, match.start()) + 1), 'raw': raw})

def matches(route: str) -> bool:
    if route in routes:
        return True
    for declared in routes:
        parts_a, parts_b = route.strip('/').split('/'), declared.strip('/').split('/')
        if len(parts_a) != len(parts_b):
            continue
        if all(b == ':param' or a == b for a, b in zip(parts_a, parts_b)):
            return True
    return False

for item in links:
    item['status'] = 'MATCH' if matches(item['route']) else 'REVIEW'
OUT.mkdir(parents=True, exist_ok=True)
with (OUT / 'web_route_reconciliation_2026-08-20.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=['route', 'raw', 'source', 'line', 'status'])
    writer.writeheader(); writer.writerows(links)

lines = [
    '# Web Route Reconciliation', '',
    '> **منهجية:** مطابقة ساكنة بين `router.tsx` وروابط literal/template في source. لا تثبت هذه النتيجة rendering أو authorization أو payloads؛ تتطلب النتائج Browser E2E لاحقاً.', '',
    '| Declared protected/public route |', '|---|'
]
lines.extend(f'| `{route}` |' for route in routes)
lines.extend(['', '## Navigation targets requiring reconciliation', '', '| Target | Source | Status |', '|---|---|---|'])
for item in links:
    if item['status'] == 'REVIEW':
        lines.append(f"| `{item['raw']}` | `{item['source']}:{item['line']}` | no static route match |")
(ROOT / 'docs/WEB_ROUTE_RECONCILIATION.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(f'declared={len(routes)} links={len(links)} review={sum(x["status"] == "REVIEW" for x in links)}')
