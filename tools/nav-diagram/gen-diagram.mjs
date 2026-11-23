/**
 * Task 1 (Night Mission) — Student-web navigation graph generator.
 * Produces docs/diagrams/student-web-navigation-graph.svg
 *
 * Methodology: every node/edge is derived from the static recon inventory in
 * docs/student-web-navigation-recon.md (grep of <Link / navigate( / href /
 * window.location / menu configs across apps/student-web/src).
 *
 * Color semantics (legend at bottom-right):
 *   GREEN   primary-nav surfaces (Sidebar / BottomNav)
 *   SKY     chrome-only surfaces (Navbar bell / search)
 *   SLATE   nested-only surfaces (in-app links, no nav chrome)
 *   TEAL    /study hub internals (URL ?tab= state, same-route mounts)
 *   CYAN    entitlement CTA hub (تفعيل كود)
 *   AMBER   flag-gated / orphan (single incoming edge)
 *   RED     legacy redirect-only routes + dead/legacy EDGES (dashed red)
 *   PURPLE  hard full-reload navigation (window.location)
 */
import { writeFileSync } from 'node:fs';

const OUT = new URL('../../docs/diagrams/student-web-navigation-graph.svg', import.meta.url).pathname;

const C = {
  ink: '#0f172a', sub: '#475569', faint: '#94a3b8',
  primaryFill: '#ecfdf5', primaryStroke: '#059669',
  skyFill: '#f0f9ff', skyStroke: '#0284c7',
  slateFill: '#f8fafc', slateStroke: '#64748b',
  tealFill: '#f0fdfa', tealStroke: '#0d9488',
  cyanFill: '#ecfeff', cyanStroke: '#0891b2',
  amberFill: '#fffbeb', amberStroke: '#d97706',
  redFill: '#fef2f2', redStroke: '#dc2626',
  purple: '#7c3aed', blue: '#0284c7', gray: '#64748b',
  red: '#dc2626', amber: '#d97706', teal: '#0d9488', green: '#059669',
  clusterFill: '#fbfcfe', clusterStroke: '#dbe3ee',
};

const W = 2700, H = 1660;
let defs = '', body = '';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

for (const [k, col] of Object.entries({ gray: C.gray, blue: C.blue, red: C.red, amber: C.amber, purple: C.purple, teal: C.teal, green: C.green, faint: C.faint })) {
  defs += `<marker id="arr-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${col}"/></marker>`;
}

const NODE_STYLES = {
  primary: { fill: C.primaryFill, stroke: C.primaryStroke },
  chrome: { fill: C.skyFill, stroke: C.skyStroke },
  nested: { fill: C.slateFill, stroke: C.slateStroke },
  hub: { fill: C.tealFill, stroke: C.tealStroke },
  cta: { fill: C.cyanFill, stroke: C.cyanStroke },
  flag: { fill: C.amberFill, stroke: C.amberStroke },
  orphan: { fill: C.amberFill, stroke: C.amberStroke, dash: '7 4' },
  legacy: { fill: C.redFill, stroke: C.redStroke, bold: true },
  chromeNode: { fill: '#e0f2fe', stroke: C.blue, bold: true },
};

const nodes = {};
function node(id, x, y, w, h, ar, en, style, badge) { nodes[id] = { id, x, y, w, h, ar, en, style, badge }; }

function renderNodes() {
  let s = '';
  for (const n of Object.values(nodes)) {
    const st = NODE_STYLES[n.style] || NODE_STYLES.nested;
    const sw = st.bold ? 2.6 : 1.6;
    const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : '';
    s += `<g><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="11" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${sw}"${dash}/>`;
    const cy = n.y + n.h / 2;
    if (n.en) {
      s += `<text x="${n.x + n.w / 2}" y="${cy - 4}" text-anchor="middle" ${AR} font-size="14.5" font-weight="700" fill="${C.ink}">${esc(n.ar)}</text>`;
      s += `<text x="${n.x + n.w / 2}" y="${cy + 13}" text-anchor="middle" font-family="ui-monospace,'Cascadia Mono',monospace" font-size="10.5" fill="${C.sub}">${esc(n.en)}</text>`;
    } else {
      s += `<text x="${n.x + n.w / 2}" y="${cy + 5.5}" text-anchor="middle" ${AR} font-size="14.5" font-weight="700" fill="${C.ink}">${esc(n.ar)}</text>`;
    }
    if (n.badge) {
      const bw = 20 + n.badge.length * 6.2;
      s += `<rect x="${n.x + n.w - bw - 4}" y="${n.y - 10}" width="${bw}" height="17" rx="8.5" fill="#ffffff" stroke="${st.stroke}" stroke-width="1"/><text x="${n.x + n.w - 4 - bw / 2}" y="${n.y + 2}" text-anchor="middle" ${AR} font-size="9.5" fill="${st.stroke}">${esc(n.badge)}</text>`;
    }
    s += `</g>`;
  }
  return s;
}

function anchor(id, side, t = 0.5) {
  const n = nodes[id];
  if (side === 'l') return [n.x, n.y + n.h * t];
  if (side === 'r') return [n.x + n.w, n.y + n.h * t];
  if (side === 't') return [n.x + n.w * t, n.y];
  return [n.x + n.w * t, n.y + n.h];
}

const AR = `font-family="'Noto Sans Arabic','Noto Sans',sans-serif" style="direction:rtl;unicode-bidi:plaintext"`;
function label(mx, my, text, color) {
  const w = text.length * 6.4 + 12;
  body += `<rect x="${mx - w / 2}" y="${my - 9}" width="${w}" height="17" rx="8.5" fill="#ffffff" fill-opacity="0.95" stroke="${color}" stroke-width="0.8"/>`;
  body += `<text x="${mx}" y="${my + 3.5}" text-anchor="middle" ${AR} font-size="10.5" fill="${color}" font-weight="600">${esc(text)}</text>`;
}
function labelRot(x, y, text, color) {
  const w = text.length * 6.4 + 12;
  body += `<rect x="${x - 8}" y="${y - w / 2}" width="16" height="${w}" rx="8" fill="#ffffff" fill-opacity="0.95" stroke="${color}" stroke-width="0.8"/>`;
  body += `<text x="${x}" y="${y}" text-anchor="middle" transform="rotate(-90 ${x} ${y})" ${AR} font-size="10.5" fill="${color}" font-weight="600">${esc(text)}</text>`;
}
function caption(x, y, text, color = C.sub, size = 12) {
  body += `<text x="${x}" y="${y}" text-anchor="middle" ${AR} font-size="${size}" fill="${color}">${esc(text)}</text>`;
}

function edge(from, fromSide, to, toSide, opts = {}) {
  const { label: labelText, color = 'gray', dashed = false, ft = 0.5, lt = 0.5, labelX, labelY, cp1, cp2, width = 2, noArrow = false } = opts;
  const [x1, y1] = anchor(from, fromSide, ft);
  const [x2, y2] = anchor(to, toSide, lt);
  const d = 46;
  let c1, c2;
  if (fromSide === 'r') c1 = [x1 + d, y1]; else if (fromSide === 'l') c1 = [x1 - d, y1]; else if (fromSide === 't') c1 = [x1, y1 - d]; else c1 = [x1, y1 + d];
  if (toSide === 'r') c2 = [x2 + d, y2]; else if (toSide === 'l') c2 = [x2 - d, y2]; else if (toSide === 't') c2 = [x2, y2 - d]; else c2 = [x2, y2 + d];
  if (cp1) c1 = cp1; if (cp2) c2 = cp2;
  const stroke = { gray: C.gray, blue: C.blue, red: C.red, amber: C.amber, purple: C.purple, teal: C.teal, green: C.green, faint: C.faint }[color];
  const dashAttr = dashed ? ' stroke-dasharray="7 5"' : '';
  const marker = noArrow ? '' : ` marker-end="url(#arr-${color})"`;
  body += `<path d="M ${x1} ${y1} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}"${dashAttr}${marker}/>`;
  if (labelText) label(labelX ?? (x1 + x2) / 2, labelY ?? (y1 + y2) / 2, labelText, stroke);
}

function poly(points, opts = {}) {
  const { label: labelText, color = 'gray', dashed = false, labelX, labelY, labelAt = 'mid', width = 2 } = opts;
  const stroke = { gray: C.gray, blue: C.blue, red: C.red, amber: C.amber, purple: C.purple, teal: C.teal, green: C.green, faint: C.faint }[color];
  const dashAttr = dashed ? ' stroke-dasharray="7 5"' : '';
  // rounded polyline
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i], [nx, ny] = points[i + 1], [prx, pry] = points[i - 1];
    const r = 14;
    const v1 = [px - prx, py - pry], v2 = [nx - px, ny - py];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const p1 = [px - v1[0] / l1 * r, py - v1[1] / l1 * r], p2 = [px + v2[0] / l2 * r, py + v2[1] / l2 * r];
    d += ` L ${p1[0]} ${p1[1]} Q ${px} ${py} ${p2[0]} ${p2[1]}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  body += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"${dashAttr} marker-end="url(#arr-${color})"/>`;
  if (labelText && labelAt !== 'none') {
    // find longest segment for label placement
    let bi = 0, bl = 0;
    for (let i = 0; i < points.length - 1; i++) { const l = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]); if (l > bl) { bl = l; bi = i; } }
    const mx = labelX ?? (points[bi][0] + points[bi + 1][0]) / 2;
    const my = labelY ?? (points[bi][1] + points[bi + 1][1]) / 2;
    label(mx, my, labelText, stroke);
  }
}

// ================= TITLE =================
body += `<text x="${W / 2}" y="40" text-anchor="middle" ${AR} font-size="26" font-weight="800" fill="${C.ink}">خريطة التنقل في منصة الطالب — CMS Student-Web Navigation Graph</text>`;
body += `<text x="${W / 2}" y="62" text-anchor="middle" ${AR} font-size="13" fill="${C.sub}">كل المسارات والانتقالات (Router + الشريط الجانبي + الشريط العلوي + الأزرار الداخلية) — الأحمر المتقطع = مسارات موروثة تحويلية أو حافة «ميتة»</text>`;

// ================= CLUSTERS =================
function cluster(x, y, w, h, ar, en) {
  body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.clusterFill}" stroke="${C.clusterStroke}" stroke-width="1.4"/>`;
  body += `<text x="${x + w - 14}" y="${y + 25}" text-anchor="end" ${AR} font-size="15.5" font-weight="800" fill="#334155">${esc(ar)}</text>`;
  body += `<text x="${x + w - 14}" y="${y + 43}" text-anchor="end" font-family="ui-monospace,monospace" font-size="10.5" fill="${C.faint}">${esc(en)}</text>`;
}
cluster(40, 100, 620, 580, 'الدخول وإنشاء الحساب (عام)', 'Public / Auth');
cluster(1980, 100, 680, 210, 'قشرة التنقل', 'Shell chrome (Navbar / Sidebar / BottomNav)');
cluster(1800, 370, 860, 850, 'الأسطح الرئيسية', 'Primary surfaces (nav-reachable)');
cluster(1360, 370, 420, 850, 'مركز «دراستي»', '/study hub — ?tab= URL state, no route change');
cluster(780, 370, 560, 850, 'شجرة المواد والمحتوى', 'Subjects tree');
cluster(40, 700, 660, 520, 'الاختبارات والتدريب', 'Exams & Practice');
cluster(780, 1260, 560, 320, 'مكمّلات', 'Misc surfaces');
cluster(1360, 1260, 640, 320, 'مسارات موروثة — تحويل فقط', 'Legacy redirect-only (RED)');
// legend + notes drawn last

// ================= NODES =================
// Auth
node('login', 100, 180, 170, 54, 'تسجيل الدخول', '/login', 'nested');
node('forgot', 400, 160, 210, 50, 'نسيت كلمة المرور؟', '/forgot-password', 'nested');
node('reset', 400, 235, 210, 50, 'إعادة تعيين المرور', '/reset-password', 'nested');
node('register', 100, 280, 170, 54, 'إنشاء حساب جديد', '/register', 'nested');
node('verify-otp', 100, 535, 170, 50, 'التحقق من الرقم', '/verify-otp', 'flag', 'شرطي OTP');
node('guard', 400, 380, 210, 56, 'حارس المسار (غير مسجل)', 'ProtectedRoute', 'flag');
node('legal', 400, 540, 210, 110, 'الشروط · الخصوصية · تواصل', '/terms /privacy /contact', 'nested');
// Chrome
node('chrome', 2030, 180, 580, 100, 'قشرة التنقل: الشريط الجانبي + العلوي + السفلي', 'Navbar · Sidebar · BottomNav', 'chromeNode');
// Primary col A
node('dashboard', 1835, 420, 200, 56, 'الرئيسية', '/dashboard', 'primary');
node('subjects', 1835, 510, 200, 56, 'المواد', '/subjects', 'primary');
node('exams', 1835, 600, 200, 56, 'الاختبارات', '/exams', 'primary');
node('study', 1835, 690, 200, 56, 'دراستي', '/study', 'primary');
node('activate-code', 1835, 860, 200, 60, 'تفعيل كود', '/activate-code', 'cta', '+14 سطح يصل إليه');
// Primary col B
node('leaderboard', 2340, 420, 200, 54, 'لوحة الصدارة', '/leaderboard', 'primary');
node('favorites', 2340, 510, 200, 54, 'المفضلة', '/favorites', 'primary');
node('profile', 2340, 600, 200, 54, 'حسابي', '/profile', 'primary');
node('notifications', 2340, 690, 200, 54, 'الإشعارات', '/notifications', 'chrome', 'جرس فقط');
node('search', 2340, 780, 200, 54, 'البحث', '/search', 'chrome', 'بحث فقط');
node('stats', 2340, 870, 200, 54, 'إحصائياتي', '/stats', 'orphan', 'يتيم: مدخل وحيد');
node('settings', 2340, 950, 200, 54, 'الإعدادات', '/settings', 'nested');
node('notfound', 2340, 1030, 200, 50, 'الصفحة غير موجودة', '404 (*)', 'nested');
// Hub internals
node('tab-content', 1400, 430, 150, 44, 'المحتوى', '?tab=content', 'hub');
node('tab-progress', 1560, 430, 150, 44, 'تقدمي', '?tab=progress', 'hub');
node('tab-library', 1400, 490, 150, 44, 'المكتبة', '?tab=library', 'hub');
node('tab-bank', 1560, 490, 160, 44, 'بنك الأسئلة', '?tab=bank', 'hub');
node('tab-courses', 1480, 550, 160, 44, 'الكورسات', '?tab=courses', 'hub');
node('bank-detail', 1400, 680, 220, 60, 'تفاصيل حزمة امتحانية', '/study?tab=bank&courseId=', 'hub');
node('training-builder', 1400, 750, 220, 50, 'بانِي اختبار تدريبي', 'TrainingBuilderModal', 'hub');
node('player', 1400, 880, 260, 56, 'مشغّل الكورس', '/my-studies/courses/:courseId', 'nested');
// Subjects tree
node('subject-detail', 820, 430, 270, 56, 'صفحة المادة', '/subjects/:slug', 'nested');
node('lecture', 820, 520, 270, 52, 'المحاضرة', '/subjects/:slug/lectures/:id', 'nested');
node('lecture-questions', 820, 600, 270, 52, 'أسئلة المحاضرة', '.../lectures/:id/questions', 'nested');
node('question-single', 820, 680, 270, 52, 'سؤال مفرد', '/subjects/:slug/questions/:id', 'nested');
node('subject-library', 820, 760, 270, 52, 'مكتبة المادة', '/subjects/:slug/library', 'nested');
node('subject-modal', 1000, 880, 260, 56, 'نافذة خيارات المادة', 'SubjectModal (bottom sheet)', 'hub');
// Exams & practice
node('exam-run', 80, 760, 240, 56, 'تنفيذ الاختبار', '/exams/:examId', 'nested');
node('exam-review', 80, 850, 240, 52, 'مراجعة الاختبار', '/exams/:sessionId/review', 'nested');
node('practice-exam', 380, 760, 260, 56, 'جلسة تدريب (نموذج)', '/practice/exam/:examModelId', 'nested');
node('practice-categorized', 380, 850, 260, 56, 'جلسة تدريب (مصنّف)', '/practice/categorized/:subjectId', 'nested');
node('exams-catalog', 80, 950, 240, 52, 'فهرس الاختبارات', 'ExamsCatalogPage (داخل /exams)', 'nested');
node('practice-catalog', 380, 950, 260, 52, 'فهرس التدريب', 'PracticeCatalog (داخل /exams)', 'nested', 'تبويب ?subtab=practice');
// Misc
node('action-target', 820, 1330, 240, 56, 'أهداف إشعار actionUrl', '20 مساراً مسموحاً', 'nested');
// Legacy RED
node('root-redirect', 1400, 1330, 170, 50, 'الجذر', '/', 'legacy');
node('library-legacy', 1590, 1330, 170, 50, 'المكتبة (قديم)', '/library', 'legacy');
node('practice-legacy', 1400, 1410, 170, 50, 'التدريب (قديم)', '/practice', 'legacy');
node('my-studies-legacy', 1590, 1410, 185, 50, 'دراستي (قديم)', '/my-studies', 'legacy');
node('exam-courses-legacy', 1800, 1330, 170, 50, 'الدورات (قديم)', '/exam-courses(/:id)', 'legacy');
node('back-edge', 1800, 1410, 170, 50, 'أزرار «عودة» سابقة', 'navigate(-1)', 'legacy', '5 صفحات');

// ================= EDGES =================
// --- chrome fan-out (blue, unlabeled; legend explains) ---
edge('chrome', 'b', 'dashboard', 't', { color: 'blue', ft: 0.12, lt: 0.75 });
edge('chrome', 'b', 'subjects', 't', { color: 'blue', ft: 0.2, lt: 0.5 });
edge('chrome', 'b', 'exams', 't', { color: 'blue', ft: 0.28, lt: 0.5 });
edge('chrome', 'b', 'study', 't', { color: 'blue', ft: 0.36, lt: 0.5 });
edge('chrome', 'b', 'leaderboard', 't', { color: 'blue', ft: 0.62, lt: 0.5 });
edge('chrome', 'b', 'favorites', 't', { color: 'blue', ft: 0.7, lt: 0.5 });
edge('chrome', 'b', 'profile', 't', { color: 'blue', ft: 0.78, lt: 0.5 });
edge('chrome', 'b', 'notifications', 't', { color: 'blue', ft: 0.86, lt: 0.5 });
edge('chrome', 'b', 'search', 't', { color: 'blue', ft: 0.94, lt: 0.5 });

// --- auth ---
edge('login', 'r', 'forgot', 'l', { label: 'نسيت كلمة المرور؟', ft: 0.35, lt: 0.5, labelY: 172 });
edge('login', 'b', 'register', 't', { label: 'حساب جديد', ft: 0.5, lt: 0.5, labelX: 243, labelY: 262 });
edge('register', 'b', 'verify-otp', 't', { label: 'بعد التسجيل (شرطي OTP)', color: 'amber', dashed: true, ft: 0.5, lt: 0.5, labelX: 300, labelY: 445 });
edge('forgot', 'b', 'reset', 't', { label: 'بعد إرسال الرمز', ft: 0.5, lt: 0.5, labelX: 680, labelY: 228 });
edge('reset', 'l', 'login', 'b', { label: 'بعد النجاح', ft: 0.2, lt: 0.75, cp1: [300, 262], cp2: [186, 248], labelX: 330, labelY: 258 });
edge('register', 'r', 'legal', 'l', { label: 'الشروط عبر <a href> — تحديث كامل', color: 'red', dashed: true, ft: 0.5, lt: 0.75, cp1: [330, 307], cp2: [340, 622], labelX: 475, labelY: 470 });
edge('login', 'r', 'legal', 'l', { label: 'تذيـل الصفحة', ft: 0.65, lt: 0.3, cp1: [330, 215], cp2: [340, 573], labelX: 500, labelY: 330 });
edge('guard', 'l', 'login', 'r', { label: 'غير مسجل → /login?next=', color: 'amber', dashed: true, ft: 0.5, lt: 0.75, cp1: [340, 408], cp2: [330, 222], labelX: 345, labelY: 355 });
// login/verify -> dashboard via top routes (green)
poly([[175, 180], [175, 105], [1865, 105], [1865, 412]], { color: 'green', label: 'دخول ناجح → ?next أو /dashboard', labelX: 1010, labelY: 118 });
poly([[100, 560], [20, 560], [20, 86], [1905, 86], [1905, 412]], { color: 'green', label: 'بعد نجاح التحقق (OTP)', labelX: 1010, labelY: 78 });

// --- dashboard actions ---
edge('dashboard', 'r', 'favorites', 'l', { label: 'شريحة المفضلة', ft: 0.5, lt: 0.5, labelX: 2188, labelY: 486 });
edge('dashboard', 'b', 'subjects', 't', { label: 'تصفح المواد', ft: 0.5, lt: 0.5, labelX: 2020, labelY: 499 });
poly([[1835, 434], [1755, 434], [1755, 890], [1831, 890]], { label: 'تفعيل كود (مواد فارغة)', labelX: 1650, labelY: 655, labelAt: 'none' });
poly([[2035, 459], [2090, 459], [2090, 718], [2041, 718]], { color: 'teal', label: 'وصول سريع → تبويبات دراستي', labelX: 2185, labelY: 588 });
edge('dashboard', 'b', 'subject-modal', 'r', { label: 'بطاقات «موادي» ومتابعة', ft: 0.08, lt: 0.5, cp1: [1851, 1080], cp2: [1400, 980], labelX: 1620, labelY: 1075 });

// --- study -> tabs (teal; semantics in cluster subtitle) ---
edge('study', 'l', 'tab-content', 't', { color: 'teal', ft: 0.1, lt: 0.5, cp1: [1800, 696], cp2: [1475, 370] });
edge('study', 'l', 'tab-progress', 't', { color: 'teal', ft: 0.3, lt: 0.5, cp1: [1800, 713], cp2: [1635, 380] });
edge('study', 'l', 'tab-library', 'b', { color: 'teal', ft: 0.5, lt: 0.5, cp1: [1750, 730], cp2: [1475, 600] });
edge('study', 'l', 'tab-bank', 'r', { color: 'teal', ft: 0.7, lt: 0.5, cp1: [1789, 747], cp2: [1766, 512] });
edge('study', 'l', 'tab-courses', 'r', { color: 'teal', ft: 0.9, lt: 0.5, cp1: [1789, 764], cp2: [1686, 572] });

// --- hub internals ---
edge('tab-content', 'l', 'subject-detail', 't', { label: 'صفحة المادة وبطاقات المحاضرات', color: 'teal', ft: 0.5, lt: 0.8, cp1: [1340, 452], cp2: [1100, 420], labelX: 1230, labelY: 448 });
edge('tab-bank', 'b', 'bank-detail', 't', { label: 'بطاقة حزمة → ?courseId=', color: 'teal', ft: 0.7, lt: 0.8, cp1: [1672, 600], cp2: [1576, 640], labelX: 1690, labelY: 616 });
edge('tab-bank', 'b', 'training-builder', 'l', { label: 'بناء اختبار تدريبي', color: 'teal', ft: 0.25, lt: 0.5, cp1: [1600, 650], cp2: [1360, 775], labelX: 1700, labelY: 705 });
edge('training-builder', 'b', 'practice-categorized', 't', { label: 'بعد سحب الأسئلة ?questionIds=', color: 'teal', ft: 0.5, lt: 0.5, cp1: [1300, 800], cp2: [800, 830], labelX: 950, labelY: 868 });
edge('bank-detail', 'l', 'practice-exam', 't', { label: 'تدريب', ft: 0.3, lt: 0.5, cp1: [1150, 650], cp2: [800, 640], labelX: 950, labelY: 664 });
edge('bank-detail', 'b', 'exam-run', 'r', { label: 'اختبار', ft: 0.5, lt: 0.5, cp1: [1200, 1060], cp2: [500, 1000], labelX: 850, labelY: 1032 });
edge('tab-courses', 'b', 'player', 't', { label: 'بطاقة كورس → المشغّل', color: 'teal', ft: 0.3, lt: 0.9, cp1: [1620, 650], cp2: [1660, 830], labelX: 1712, labelY: 762 });
poly([[1660, 908], [1722, 908], [1722, 572], [1646, 572]], { color: 'teal', dashed: true });

// --- subjects tree ---
edge('subjects', 'l', 'subject-detail', 't', { label: 'بطاقة مادة / شريحة موادي', ft: 0.5, lt: 0.5, cp1: [1500, 690], cp2: [1250, 560], labelX: 1470, labelY: 648 });
edge('subject-detail', 'b', 'lecture', 't', { label: 'بطاقة محاضرة', ft: 0.3, lt: 0.3, labelX: 800, labelY: 510 });
poly([[1090, 466], [1150, 466], [1150, 786], [1096, 786]], { label: 'تبويب المكتبة (صلاحية)', labelX: 1245, labelY: 625, labelAt: 'none' });
edge('subject-detail', 'r', 'tab-bank', 't', { label: 'بنك (صلاحية)', color: 'teal', ft: 0.2, lt: 0.3, cp1: [1300, 430], cp2: [1500, 460], labelX: 1315, labelY: 420 });
edge('subject-detail', 'r', 'tab-courses', 'l', { label: 'كورسات (صلاحية)', color: 'teal', ft: 0.9, lt: 0.5, cp1: [1250, 481], cp2: [1470, 620], labelX: 1285, labelY: 560 });
edge('subject-modal', 't', 'subject-detail', 'r', { label: 'المحتوى', color: 'teal', ft: 0.5, lt: 0.55, cp1: [1300, 700], cp2: [1200, 500], labelX: 1255, labelY: 668 });
edge('subject-modal', 't', 'tab-library', 'b', { label: 'بنك/المكتبة/الكورسات (حسب الصلاحية)', color: 'teal', ft: 0.35, lt: 0.5, cp1: [1100, 650], cp2: [1475, 600], labelX: 1240, labelY: 618 });
edge('lecture', 'b', 'lecture-questions', 't', { label: 'بدء الأسئلة (n>0)', ft: 0.3, lt: 0.3, labelX: 1010, labelY: 592 });
edge('subject-detail', 'b', 'activate-code', 'l', { label: 'قفل / توسيع الاشتراك', color: 'amber', dashed: true, ft: 0.5, lt: 0.5, cp1: [1200, 1150], cp2: [1700, 950], labelX: 1400, labelY: 1118 });
edge('practice-catalog', 'l', 'lecture-questions', 'l', { label: 'بطاقة تدريب محاضرة', ft: 0.5, lt: 0.5, cp1: [550, 950], cp2: [700, 626], labelX: 720, labelY: 898 });

// --- exams ---
edge('exams', 'b', 'exams-catalog', 't', { label: 'يعرض داخل /exams', ft: 0.5, lt: 0.5, cp1: [1300, 1000], cp2: [600, 1080], labelX: 1250, labelY: 1005 });
poly([[80, 976], [55, 976], [55, 788], [74, 788]], { labelAt: 'none' });
labelRot(30, 880, 'صف اختبار', C.gray);
poly([[320, 788], [355, 788], [355, 876], [326, 876]], { labelAt: 'none' });
label(505, 832, 'مراجعة (canReview)', C.gray);

// --- favorites ---
edge('favorites', 'b', 'player', 'r', { label: 'متابعة (?episode=)', ft: 0.15, lt: 0.5, cp1: [2250, 750], cp2: [1800, 980], labelX: 2140, labelY: 848 });
edge('favorites', 'b', 'question-single', 'r', { label: 'عرض السؤال', ft: 0.45, lt: 0.5, cp1: [2200, 900], cp2: [1500, 760], labelX: 1750, labelY: 782 });
edge('favorites', 'b', 'subject-library', 'r', { label: 'فتح ملف (?openFile=)', ft: 0.75, lt: 0.5, cp1: [2400, 1050], cp2: [1450, 1000], labelX: 1750, labelY: 992 });
edge('favorites', 'l', 'subjects', 'r', { label: 'فارغ → تصفح', color: 'amber', dashed: true, ft: 0.5, lt: 0.75, labelX: 2188, labelY: 530 });

// --- profile / settings / notifications ---
edge('profile', 'b', 'activate-code', 'r', { label: 'تفعيل كود', ft: 0.3, lt: 0.5, cp1: [2200, 700], cp2: [2100, 850], labelX: 2205, labelY: 772 });
poly([[2540, 627], [2612, 627], [2612, 897], [2546, 897]], { label: 'الإعدادات', labelX: 2585, labelY: 758, labelAt: 'none' });
body += `<text x="2440" y="670" text-anchor="middle" ${AR} font-size="10" fill="${C.purple}" font-weight="600">خروج: /login (تحديث كامل)</text>`;
poly([[2540, 717], [2634, 760], [2634, 1180], [940, 1180], [940, 1322]], { color: 'purple', dashed: true, label: 'actionUrl مقنّن — تحديث كامل (20 مساراً)', labelX: 1800, labelY: 1168 });
poly([[2540, 977], [2612, 977], [2612, 1215], [680, 1215], [680, 690], [505, 690], [505, 656]], { label: 'قانوني (شروط/خصوصية/تواصل)', labelX: 1000, labelY: 1234 });
poly([[1835, 890], [1770, 890], [1770, 1160], [2070, 1160], [2070, 448], [2041, 448]], { color: 'green', label: 'بعد التفعيل → الرئيسية (تلقائي 1.5 ث + رابط)', labelX: 1930, labelY: 1148 });

// --- leaderboard/stats ---
poly([[2340, 447], [2300, 447], [2300, 897], [2334, 897]], { label: 'الإحصائيات', labelAt: 'none' });
labelRot(2285, 660, 'الإحصائيات', C.gray);
poly([[2340, 913], [2270, 913], [2270, 466], [2334, 466]], { label: 'لوحة المتصدرين', labelAt: 'none' });
labelRot(2252, 690, 'لوحة المتصدرين', C.gray);

// --- search ---
edge('search', 'l', 'subject-detail', 't', { label: 'نتائج البحث → شجرة المواد', ft: 0.5, lt: 0.2, cp1: [2100, 1050], cp2: [1300, 600], labelX: 1750, labelY: 935 });

// --- LEGACY RED edges ---
poly([[1485, 1330], [1485, 1248], [2110, 1248], [2110, 462], [2041, 462]], { color: 'red', dashed: true, label: '→ /dashboard', labelX: 1500, labelY: 1234 });
poly([[1675, 1330], [1675, 1270], [1790, 1270], [1790, 730], [1831, 730]], { color: 'red', dashed: true, label: 'تحويل → ?tab=library', labelX: 1620, labelY: 1250 });
poly([[1400, 1435], [1330, 1435], [1330, 1200], [1805, 1200], [1805, 628], [1831, 628]], { color: 'red', dashed: true, label: 'تحويل → ?subtab=practice', labelX: 1560, labelY: 1188 });
poly([[1775, 1435], [1818, 1435], [1818, 744], [1831, 744]], { color: 'red', dashed: true, label: 'خريطة تحويل ?tab=', labelX: 1905, labelY: 1090 });
poly([[1885, 1330], [1885, 1250], [1672, 1250], [1672, 540]], { color: 'red', dashed: true, label: 'تحويل → ?tab=bank', labelX: 1810, labelY: 1238 });
poly([[400, 610], [32, 640], [32, 1290], [1485, 1290], [1485, 1322]], { color: 'red', dashed: true, label: '«العودة للرئيسية» → الجذر / (هدف موروث)', labelX: 1100, labelY: 1282 });

// ================= NOTES CARD (bottom-left) =================
body += `<rect x="40" y="1250" width="700" height="330" rx="16" fill="#fff7f7" stroke="${C.redStroke}" stroke-width="1.4" stroke-dasharray="2 0"/>`;
body += `<rect x="40" y="1250" width="700" height="42" rx="16" fill="${C.redFill}"/><rect x="40" y="1272" width="700" height="20" fill="${C.redFill}"/>`;
body += `<text x="726" y="1277" text-anchor="end" ${AR} font-size="16" font-weight="800" fill="${C.redStroke}">ملاحظات التنقل الحمراء — اكتشافات المسارات «الميتة»</text>`;
const notes = [
  '١. لا يوجد أي رابط داخلي يشير إلى ‎/library أو ‎/practice أو ‎/my-studies أو ‎/exam-courses — مسارات تحويلية',
  '      موروثة لا تُكتشف إلا برابط خارجي أو إشعار قديم أو كتابة يدوية.',
  '٢. زر «العودة للرئيسية» في صفحات الشروط/الخصوصية/تواصل يستهدف الجذر ‎/ ثم يُحوَّل إلى ‎/dashboard —',
  '      حافة موروثة غير مباشرة (تحويل مزدوج).',
  '٣. أزرار «عودة» في ٥ صفحات عمق تعتمد history.back() — عند الدخول برابط مباشر قد تخرج من التطبيق.',
  '٤. ‎/stats لا يظهر في أي قائمة تنقل — مدخله الوحيد رابط «الإحصائيات» من لوحة الصدارة (يتيم).',
  '٥. الجرس يفتح صفحة إشعارات كاملة — لا توجد لوحة منسدلة (تُعالج في المهمة ٤ ليلاً).',
  '٦. تبويبات ‎/study المتقاعدة تُحوَّل: overview→progress · exams→‎/exams · leaderboard→‎/leaderboard.',
  '٧. فُتات الخبز (PathTrail) يعرض «الرئيسية» على كل صفحة داخل القشرة — حواف موحّدة غير مرسومة هنا.',
];
notes.forEach((t, i) => {
  body += `<text x="726" y="${1310 + i * 26}" text-anchor="end" ${AR} font-size="12.5" fill="#7f1d1d">${esc(t)}</text>`;
});

// ================= LEGEND (bottom-right) =================
body += `<rect x="2020" y="1250" width="640" height="330" rx="16" fill="#f8fafc" stroke="${C.clusterStroke}" stroke-width="1.4"/>`;
body += `<text x="2636" y="1282" text-anchor="end" ${AR} font-size="16" font-weight="800" fill="#334155">المفتاح — Legend</text>`;
function legendItem(x, y, fill, stroke, label, dashed) {
  body += `<rect x="${x}" y="${y}" width="34" height="20" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.8"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
  body += `<text x="${x + 42}" y="${y + 14.5}" ${AR} font-size="11.5" fill="${C.ink}">${esc(label)}</text>`;
}
// right column (RTL first) then left column
legendItem(2330, 1300, C.primaryFill, C.primaryStroke, 'سطح رئيسي في القوائم');
legendItem(2330, 1330, C.skyFill, C.skyStroke, 'من الشريط العلوي فقط');
legendItem(2330, 1360, C.slateFill, C.slateStroke, 'متداخل من أزرار داخلية');
legendItem(2330, 1390, C.tealFill, C.tealStroke, 'داخل مركز دراستي');
legendItem(2330, 1420, C.cyanFill, C.cyanStroke, 'محور «تفعيل كود»');
legendItem(2330, 1450, C.amberFill, C.amberStroke, 'شرطي/يتيم');
legendItem(2330, 1480, C.redFill, C.redStroke, 'حافة موروثة «ميتة»', true);
legendItem(2330, 1510, C.redFill, C.redStroke, 'عقدة تحويل فقط');
legendItem(2040, 1300, '#ffffff', C.blue, 'حافة من قشرة التنقل');
legendItem(2040, 1330, '#ffffff', C.green, 'حافة تدفق أساسي');
legendItem(2040, 1360, '#ffffff', C.gray, 'حافة داخلية عادية');
legendItem(2040, 1390, '#ffffff', C.teal, 'حالة URL داخل المركز');
legendItem(2040, 1420, '#ffffff', C.amber, 'حراسة/شرط علم', true);
legendItem(2040, 1450, '#ffffff', C.purple, 'تحديث كامل window.location', true);
legendItem(2040, 1480, '#ffffff', C.red, 'حافة موروثة «ميتة»', true);
body += `<text x="2636" y="1558" text-anchor="end" ${AR} font-size="11" fill="${C.sub}">التغطية الكاملة لكل حافة (أكثر من ١٢٠) في الجدول التفصيلي: docs/student-web-navigation-recon.md</text>`;

const nodesSvg = renderNodes();
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Noto Sans Arabic','Noto Sans',sans-serif">
<defs>${defs}</defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${nodesSvg}
${body}
</svg>`;
writeFileSync(OUT, svg);
console.log('written', OUT, svg.length, 'bytes');

// ---------- geometry dump for the validator ----------
const dump = { W, H, nodes: [], labels: [], paths: [] };
for (const n of Object.values(nodes)) dump.nodes.push({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h });
const LABEL_RE = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="17"/g;
let m;
const labelSrc = body;
while ((m = LABEL_RE.exec(labelSrc))) dump.labels.push({ x: +m[1], y: +m[2], w: +m[3], h: 17 });
const PATH_RE = /<path d="M ([\d.]+) ([\d.]+)[^"]*"/g;
while ((m = PATH_RE.exec(body))) dump.paths.push({ x1: +m[1], y1: +m[2] });
writeFileSync(new URL('./geometry.json', import.meta.url).pathname, JSON.stringify(dump));
console.log('geometry.json written:', dump.nodes.length, 'nodes,', dump.labels.length, 'labels');
