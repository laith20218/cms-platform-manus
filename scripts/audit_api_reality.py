#!/usr/bin/env python3
"""Read-only static inventory of ASP.NET controller endpoints and student-web API calls.
The output is an audit input; dynamic routes and contracts remain subject to manual review.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTROLLERS = ROOT / "apps/api/src/CMS.Api/Controllers"
WEB = ROOT / "apps/student-web/src"
OUT = ROOT / "docs/security"
HTTP_LINE = re.compile(r'\[(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete)(?:\("([^"]*)"\))?\]')
ROUTE = re.compile(r'\[Route\("([^"]+)"\)\]')
PUBLIC = re.compile(r'public\s+(?:async\s+)?(?P<return>[\w<>?.,\[\] ]+)\s+(?P<name>\w+)\s*\((?P<args>.*)\)')
SEND = re.compile(r'_sender\.Send\(new\s+(\w+)')
WEB_CALL = re.compile(r'apiClient\.(get|post|put|patch|delete)\(\s*([`"\'])(.*?)\2', re.DOTALL)


def combine(base: str, suffix: str | None) -> str:
    return '/' + '/'.join(p.strip('/') for p in (base, suffix or '') if p.strip('/'))


def normalise(route: str) -> str:
    route = re.sub(r'^/?api/v1/?', '/', route)
    return re.sub(r'\{[^}]+\}', '{id}', route)


def controller_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in sorted(CONTROLLERS.glob('*.cs')):
        text = path.read_text(encoding='utf-8')
        root = ROUTE.search(text)
        base = root.group(1) if root else ''
        class_start = text.find('class ')
        class_prefix = text[:class_start] if class_start >= 0 else ''
        class_auth = 'AllowAnonymous' if 'AllowAnonymous' in class_prefix else ('Authorize' if 'Authorize' in class_prefix else 'Unspecified')
        lines = text.splitlines()
        for idx, line in enumerate(lines):
            http = HTTP_LINE.search(line)
            if not http:
                continue
            signature = ''
            start = None
            for probe in range(idx + 1, min(len(lines), idx + 26)):
                signature += ' ' + lines[probe].strip()
                public_offset = signature.find('public ')
                signature_tail = signature[public_offset:] if public_offset >= 0 else ''
                if public_offset >= 0 and '(' in signature_tail and ')' in signature_tail:
                    start = probe
                    break
            if start is None:
                continue
            cleaned = re.sub(r'\s+', ' ', signature)
            name_match = re.search(r'public\s+(?:async\s+)?(.+?)\s+(\w+)\s*\((.*)\)', cleaned)
            if not name_match:
                continue
            context = '\\n'.join(lines[idx:start + 1])
            auth = 'AllowAnonymous' if 'AllowAnonymous' in context else ('Authorize' if 'Authorize' in context else class_auth)
            body = '\n'.join(lines[start:min(len(lines), start + 180)])
            handler = SEND.search(body)
            rows.append({
                'method': http.group(1).replace('Http', '').upper(),
                'route': combine(base, http.group(2)),
                'controller': path.name,
                'action': name_match.group(2),
                'request': name_match.group(3).strip(),
                'response': name_match.group(1).strip(),
                'auth': auth,
                'handler': handler.group(1) if handler else '',
            })
    return rows


def web_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in sorted(WEB.rglob('*')):
        if path.suffix not in {'.ts', '.tsx'}:
            continue
        text = path.read_text(encoding='utf-8')
        for match in WEB_CALL.finditer(text):
            route = re.sub(r'\$\{[^}]+\}', '{id}', match.group(3))
            rows.append({
                'method': match.group(1).upper(),
                'route': route if route.startswith('/') else '/' + route,
                'consumer': str(path.relative_to(ROOT)),
                'line': str(text.count('\n', 0, match.start()) + 1),
            })
    return rows


OUT.mkdir(parents=True, exist_ok=True)
api = controller_rows()
web = web_rows()
for name, rows in [('api_controller_inventory_2026-08-20.csv', api), ('web_api_consumer_inventory_2026-08-20.csv', web)]:
    with (OUT / name).open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]) if rows else [])
        if rows:
            writer.writeheader(); writer.writerows(rows)

api_pairs = {(r['method'], normalise(r['route'])) for r in api}
for item in web:
    item['match'] = 'MATCH' if (item['method'], normalise(item['route'])) in api_pairs else 'REVIEW'
with (OUT / 'web_api_reconciliation_2026-08-20.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=list(web[0]) if web else [])
    if web:
        writer.writeheader(); writer.writerows(web)

consumers: dict[tuple[str, str], list[str]] = {}
for item in web:
    consumers.setdefault((item['method'], normalise(item['route'])), []).append(f"{item['consumer']}:{item['line']}")

def cell(value: str) -> str:
    return (value or '—').replace('|', '\\|').replace('\n', ' ')

matrix = [
    '# API Reality Matrix',
    '',
    '> **منهجية:** جرد ساكن read-only مولّد من controller attributes ونداءات `apiClient` في `student-web`. حالة `CONSUMED` تعني تطابق method/route فقط، وليست دليلاً على نجاح DTO أو runtime. الحالات `BACKEND ONLY` و`REVIEW` تستلزم تدقيقاً أو اختباراً تالياً.',
    '',
    '| Method | Route | Controller / Action | Handler | Request DTO / parameters | Response | Auth | Frontend consumer | Static status |',
    '|---|---|---|---|---|---|---|---|---|',
]
for row in sorted(api, key=lambda r: (r['route'], r['method'])):
    key = (row['method'], normalise(row['route']))
    consumer = '; '.join(consumers.get(key, []))
    status = 'CONSUMED — static route/method match' if consumer else 'BACKEND ONLY — consumer not found in student-web'
    matrix.append('| ' + ' | '.join(cell(v) for v in [
        row['method'], row['route'], f"{row['controller']} / {row['action']}", row['handler'],
        row['request'], row['response'], row['auth'], consumer, status
    ]) + ' |')
if any(item['match'] == 'REVIEW' for item in web):
    matrix.extend(['', '## Web calls requiring reconciliation', '', '| Method | Route | Consumer | Reason |', '|---|---|---|---|'])
    for item in web:
        if item['match'] == 'REVIEW':
            matrix.append(f"| {item['method']} | {item['route']} | {item['consumer']}:{item['line']} | No static controller route/method match |")
(ROOT / 'docs/API_REALITY_MATRIX.md').write_text('\n'.join(matrix) + '\n', encoding='utf-8')
print(f'controllers={len(api)} web_calls={len(web)} review_calls={sum(x["match"] == "REVIEW" for x in web)}')
