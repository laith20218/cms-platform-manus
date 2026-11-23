/** Deterministic geometric validator for the navigation diagram. */
import { readFileSync } from 'node:fs';

const g = JSON.parse(readFileSync(new URL('./geometry.json', import.meta.url), 'utf8'));
const boxes = g.nodes;
const labels = g.labels;

const intersect = (a, b, pad = 0) =>
  a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;

let issues = 0;

// 1) label vs node overlap
for (const l of labels) {
  for (const n of boxes) {
    if (intersect(l, n)) { console.log(`LABEL-NODE overlap: label(${l.x},${l.y},${l.w}x${l.h}) vs node ${n.id}(${n.x},${n.y},${n.w}x${n.h})`); issues++; }
  }
}
// 2) label vs label overlap
for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
  if (intersect(labels[i], labels[j])) { console.log(`LABEL-LABEL overlap: (${labels[i].x},${labels[i].y},${labels[i].w}) vs (${labels[j].x},${labels[j].y},${labels[j].w})`); issues++; }
}
// 3) labels outside canvas
for (const l of labels) {
  if (l.x < 4 || l.y < 4 || l.x + l.w > g.W - 4 || l.y + l.h > g.H - 4) { console.log(`LABEL out of canvas: (${l.x},${l.y},${l.w})`); issues++; }
}
// 4) node vs node overlap
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  if (intersect(boxes[i], boxes[j])) { console.log(`NODE-NODE overlap: ${boxes[i].id} vs ${boxes[j].id}`); issues++; }
}
// 5) path endpoints near some node edge (within 18px of boundary, not inside another node)
const nearBoundary = (px, py, n, tol = 18) => {
  const inX = px >= n.x - tol && px <= n.x + n.w + tol;
  const inY = py >= n.y - tol && py <= n.y + n.h + tol;
  const onEdgeX = Math.abs(px - n.x) <= tol || Math.abs(px - n.x - n.w) <= tol;
  const onEdgeY = Math.abs(py - n.y) <= tol || Math.abs(py - n.y - n.h) <= tol;
  return inX && inY && (onEdgeX || onEdgeY);
};
for (const p of g.paths) {
  const ok = boxes.some(n => nearBoundary(p.x1, p.y1, n));
  if (!ok) { console.log(`PATH start not near any node: (${p.x1},${p.y1})`); issues++; }
}
console.log(issues === 0 ? 'ALL CLEAN' : `${issues} issues`);
