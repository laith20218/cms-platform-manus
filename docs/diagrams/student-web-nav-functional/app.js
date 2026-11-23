/* CMS student-web functional navigation diagram — vanilla JS engine.
 * Reads window.__GRAPH_DATA (data/graph.js — file:// safe) and renders an
 * interactive swimlane SVG with filters, search, detail panel, pan/zoom and
 * SVG export. Static snapshot mode: index.html?static=1 renders the full
 * graph with the in-SVG legend and exposes window.__exportSVG().
 */
(function () {
  'use strict';

  var DATA = window.__GRAPH_DATA;
  if (!DATA) { document.body.innerHTML = '<p style="padding:2em">graph data missing</p>'; return; }
  var NODES = DATA.nodes, EDGES = DATA.edges;
  var byId = {}; NODES.forEach(function (n) { byId[n.id] = n; });

  var CLASSES = ['primary', 'chrome', 'nested', 'orphan', 'flag_gated', 'legacy', 'deprecated', 'auth', 'shell'];
  var KINDS = ['chrome', 'primary', 'nested', 'url_state', 'guard', 'legacy', 'hard_reload', 'back'];
  var CLASS_META = {
    primary:     { ar: 'أسطح رئيسية', en: 'Primary',   stroke: '#059669', fill: '#ecfdf5' },
    chrome:      { ar: 'من الشريط العلوي فقط', en: 'Chrome-only', stroke: '#0284c7', fill: '#f0f9ff' },
    nested:      { ar: 'متداخلة', en: 'Nested',         stroke: '#64748b', fill: '#f8fafc' },
    orphan:      { ar: 'يتيمة', en: 'Orphan',           stroke: '#d97706', fill: '#fffbeb' },
    flag_gated:  { ar: 'شرطية', en: 'Flag-gated',       stroke: '#d97706', fill: '#fffbeb', dash: '6 4' },
    legacy:      { ar: 'موروثة/ميتة', en: 'Legacy/Dead', stroke: '#dc2626', fill: '#fef2f2' },
    deprecated:  { ar: 'محذوفة', en: 'Deprecated',       stroke: '#94a3b8', fill: '#f1f5f9', dash: '3 3' },
    auth:        { ar: 'عامة (قبل الدخول)', en: 'Public', stroke: '#0d9488', fill: '#f0fdfa' },
    shell:       { ar: 'قشرة/نمط', en: 'Shell/Pattern',  stroke: '#10233a', fill: '#e8eef6' }
  };
  var KIND_META = {
    chrome:      { ar: 'قشرة', color: '#0284c7' },
    primary:     { ar: 'أساسي', color: '#059669' },
    nested:      { ar: 'داخلي', color: '#64748b' },
    url_state:   { ar: 'حالة URL', color: '#0d9488', dash: '7 5' },
    guard:       { ar: 'حارس/شرط', color: '#d97706', dash: '2 4' },
    legacy:      { ar: 'موروث/ميت', color: '#dc2626', dash: '8 5' },
    hard_reload: { ar: 'تحديث كامل', color: '#7c3aed', dash: '2 3' },
    back:        { ar: 'رجوع بالتاريخ', color: '#b91c1c', dash: '2 4' }
  };
  var LANES = [
    { id: 'A', ar: 'عام / الدخول', en: 'Auth & public' },
    { id: 'B', ar: 'القشرة والأسطح الرئيسية', en: 'Shell & primary' },
    { id: 'C', ar: 'مركز «دراستي» وتبويباته', en: 'Study hub & tabs' },
    { id: 'D', ar: 'شجرة المواد والمحتوى', en: 'Subjects tree' },
    { id: 'E', ar: 'الاختبارات والتدريب', en: 'Exams & practice' },
    { id: 'F', ar: 'الحساب وأسطح الشريط العلوي', en: 'Account & chrome-only' },
    { id: 'G', ar: 'مسارات موروثة — تحويل فقط', en: 'Legacy (RED)' }
  ];

  /* ================= layout ================= */
  var NODE_W = { default: 196, shell: 240, wide: 216 };
  var NODE_H = 58, GAP_X = 18, GAP_Y = 16, LANE_PAD_TOP = 40, LANE_PAD_BOT = 22;
  var PER_ROW = { A: 4, B: 4, C: 3, D: 3, E: 3, F: 3, G: 4 };
  var MARGIN_X = 44, MARGIN_TOP = 30, LANE_GAP = 52;

  function nodeW(n) { return n.class === 'shell' ? NODE_W.shell : (n.class === 'legacy' ? NODE_W.default : NODE_W.default); }

  var layout = computeLayout();
  function computeLayout() {
    var laneRows = {}, laneHeight = {}, y = MARGIN_TOP, maxW = 0;
    LANES.forEach(function (lane) {
      var members = NODES.filter(function (n) { return n.lane === lane.id; });
      var perRow = PER_ROW[lane.id] || 5;
      var rows = [];
      for (var i = 0; i < members.length; i += perRow) rows.push(members.slice(i, i + perRow));
      laneRows[lane.id] = rows;
      var h = LANE_PAD_TOP + rows.length * (NODE_H + GAP_Y) - GAP_Y + LANE_PAD_BOT;
      laneHeight[lane.id] = { y: y, h: h, rows: rows };
      var w = 0;
      rows.forEach(function (r) { var rw = r.reduce(function (s, n) { return s + nodeW(n) + GAP_X; }, 0) - GAP_X; if (rw > w) w = rw; });
      if (w > maxW) maxW = w;
      y += h + LANE_GAP;
    });
    var W = maxW + MARGIN_X * 2;
    var laneBottom = y - LANE_GAP;
    var H = laneBottom + 150; // dedicated legend zone below the last lane
    // positions: RTL — row members flow right → left
    NODES.forEach(function (n) {
      var lh = laneHeight[n.lane], pos = null, ri = 0, ci = 0;
      for (var r = 0; r < lh.rows.length; r++) {
        var idx = lh.rows[r].indexOf(n);
        if (idx >= 0) { ri = r; ci = idx; pos = true; break; }
      }
      if (!pos) { n._x = 0; n._y = 0; return; }
      var rowNodes = lh.rows[ri];
      var rowW = rowNodes.reduce(function (s, m) { return s + nodeW(m) + GAP_X; }, 0) - GAP_X;
      var rightEdge = MARGIN_X + (maxW - rowW) / 2 + rowW; // center each row
      var x = rightEdge;
      for (var k = 0; k <= ci; k++) { x -= nodeW(rowNodes[k]); if (k < ci) x -= GAP_X; }
      n._x = x; n._y = lh.y + LANE_PAD_TOP + ri * (NODE_H + GAP_Y);
    });
    return { W: W, H: H, laneHeight: laneHeight };
  }

  /* ================= state ================= */
  var state = {
    classes: {}, kinds: {}, query: '',
    redOnly: false, studyOnly: false,
    selected: null
  };
  CLASSES.forEach(function (c) { state.classes[c] = true; });
  KINDS.forEach(function (k) { state.kinds[k] = true; });

  /* ================= svg helpers ================= */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function measureAr(str, px) { return str.length * px * 0.52; }

  /* Arabic (RTL) text: text-anchor 'start' puts the RIGHT edge at x.
     LTR text (paths/EN): direction ltr + anchor 'end' puts the RIGHT edge at x. */
  function txtRight(parent, x, y, str, opts) {
    opts = opts || {};
    var t = el('text', {
      x: x, y: y,
      'font-size': opts.size || 12, 'font-weight': opts.weight || 400,
      fill: opts.fill || '#10233a',
      'text-anchor': (opts.ltr ? 'end' : 'start'),
      direction: opts.ltr ? 'ltr' : undefined
    }, parent);
    if (opts.mono) t.setAttribute('font-family', 'ui-monospace,monospace');
    t.textContent = str;
    return t;
  }

  function anchor(n, side) {
    var w = nodeW(n), h = NODE_H;
    if (side === 't') return [n._x + w / 2, n._y];
    if (side === 'b') return [n._x + w / 2, n._y + h];
    if (side === 'r') return [n._x + w, n._y + h / 2];
    return [n._x, n._y + h / 2];
  }
  function edgePath(a, b) {
    var ac = [a._x + nodeW(a) / 2, a._y + NODE_H / 2];
    var bc = [b._x + nodeW(b) / 2, b._y + NODE_H / 2];
    var dx = bc[0] - ac[0], dy = bc[1] - ac[1];
    var sideA, sideB;
    if (Math.abs(dy) < 8) { // same visual row → horizontal
      sideA = dx > 0 ? 'l' : 'r'; sideB = dx > 0 ? 'r' : 'l';
    } else if (dy > 0) { sideA = 'b'; sideB = Math.abs(dx) > 60 ? (dx > 0 ? 'r' : 'l') : 't'; }
    else { sideA = 't'; sideB = Math.abs(dx) > 60 ? (dx > 0 ? 'r' : 'l') : 'b'; }
    var p1 = anchor(a, sideA), p2 = anchor(b, sideB);
    var d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    var c = Math.max(28, Math.min(90, d * 0.38));
    var c1, c2;
    if (sideA === 'b') c1 = [p1[0], p1[1] + c]; else if (sideA === 't') c1 = [p1[0], p1[1] - c];
    else if (sideA === 'r') c1 = [p1[0] + c, p1[1]]; else c1 = [p1[0] - c, p1[1]];
    if (sideB === 't') c2 = [p2[0], p2[1] - c]; else if (sideB === 'b') c2 = [p2[0], p2[1] + c];
    else if (sideB === 'r') c2 = [p2[0] + c, p2[1]]; else c2 = [p2[0] - c, p2[1]];
    return 'M ' + p1[0] + ' ' + p1[1] + ' C ' + c1[0] + ' ' + c1[1] + ', ' + c2[0] + ' ' + c2[1] + ', ' + p2[0] + ' ' + p2[1];
  }

  /* ================= render ================= */
  var svg, gLanes, gEdges, gNodes, gLegend;
  var defsMarkers = {};

  function markers() {
    var defs = el('defs', {}, svg);
    Object.keys(KIND_META).forEach(function (k) {
      var m = el('marker', { id: 'arr-' + k, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', fill: KIND_META[k].color }, m);
    });
  }

  function renderStaticFrame() {
    svg = el('svg', { id: 'graph-svg', viewBox: '0 0 ' + layout.W + ' ' + layout.H, width: layout.W, height: layout.H, 'font-family': "'Noto Sans Arabic','Segoe UI',Tahoma,sans-serif" });
    document.getElementById('stage').appendChild(svg);
    markers();
    gLanes = el('g', {}, svg); gEdges = el('g', {}, svg); gNodes = el('g', {}, svg);
    LANES.forEach(function (lane) {
      var lh = layout.laneHeight[lane.id];
      var isRed = lane.id === 'G';
      el('rect', { x: 6, y: lh.y, width: layout.W - 12, height: lh.h, rx: 16,
        fill: isRed ? 'rgba(254,242,242,.55)' : 'rgba(248,250,252,.6)',
        stroke: isRed ? 'rgba(220,38,38,.35)' : 'rgba(215,226,224,.9)', 'stroke-width': 1.4 }, gLanes);
      txtRight(gLanes, layout.W - 28, lh.y + 26, lane.ar, { size: 15.5, weight: 800, fill: isRed ? '#b91c1c' : '#33475c' });
      var t2 = el('text', { x: 28, y: lh.y + 26, 'text-anchor': 'start', 'font-size': 10.5, fill: '#94a3b8',
        'font-family': 'ui-monospace,monospace', direction: 'ltr' }, gLanes);
      t2.textContent = lane.id + ' · ' + lane.en;
    });
  }

  var redEndpoints = null;
  function nodeVisible(n) {
    if (!state.classes[n.class]) return false;
    if (state.redOnly) {
      if (n.class === 'legacy' || n.class === 'deprecated') return true;
      if (!redEndpoints) {
        redEndpoints = {};
        EDGES.forEach(function (e) { if (e.isDeadOrConfusing) { redEndpoints[e.from] = true; redEndpoints[e.to] = true; } });
      }
      return !!redEndpoints[n.id];
    }
    if (state.studyOnly && !(n.lane === 'C' || n.id === 'study')) return false;
    return true;
  }
  function edgeVisible(e) {
    if (!state.kinds[e.kind]) return false;
    if (!nodeVisible(byId[e.from]) || !nodeVisible(byId[e.to])) return false;
    if (state.redOnly && !e.isDeadOrConfusing) return false;
    return true;
  }

  function renderEdges() {
    gEdges.innerHTML = '';
    EDGES.forEach(function (e) {
      var a = byId[e.from], b = byId[e.to];
      var vis = edgeVisible(e);
      var km = KIND_META[e.kind];
      var p = el('path', {
        d: edgePath(a, b), class: 'edge' + (vis ? '' : ' dimmed'),
        stroke: e.isDeadOrConfusing ? '#dc2626' : km.color,
        'stroke-width': e.isDeadOrConfusing ? 2 : 1.7,
        'stroke-dasharray': e.isDeadOrConfusing ? '8 5' : (km.dash || ''),
        opacity: e.isDeadOrConfusing ? 0.85 : 0.34,
        'marker-end': 'url(#arr-' + e.kind + ')',
        'data-id': e.id
      }, gEdges);
      p.addEventListener('click', function (ev) { ev.stopPropagation(); openDetail(e.from, e.id); });
    });
  }

  function renderNodes() {
    gNodes.innerHTML = '';
    NODES.forEach(function (n) {
      var cm = CLASS_META[n.class];
      var vis = nodeVisible(n);
      var g = el('g', { class: 'node' + (vis ? '' : ' dimmed') + (state.selected === n.id ? ' selected' : ''), 'data-id': n.id, transform: 'translate(' + n._x + ',' + n._y + ')' }, gNodes);
      el('rect', { class: 'body', width: nodeW(n), height: NODE_H, rx: 11, fill: cm.fill, stroke: cm.stroke, 'stroke-width': n.class === 'legacy' ? 2.4 : 1.6, 'stroke-dasharray': cm.dash || '' }, g);
      var badge = (n.class === 'legacy' || n.class === 'deprecated');
      var maxTitle = nodeW(n) - 26 - (badge ? 46 : 0);
      var titleStr = n.labelAr;
      while (titleStr.length > 6 && measureAr(titleStr, 13) > maxTitle) titleStr = titleStr.slice(0, -2).trim() + '…';
      txtRight(g, nodeW(n) - 12, 24, titleStr, { size: 13, weight: 800 });
      if (badge) { // red badge straddling the top-left corner — never color alone
        var bw = n.class === 'deprecated' ? 46 : 36;
        el('rect', { x: 10, y: -8, width: bw, height: 17, rx: 8.5, fill: '#dc2626', stroke: '#ffffff', 'stroke-width': 1.5 }, g);
        var bt = el('text', { x: 10 + bw / 2, y: 4.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 800, fill: '#fff' }, g);
        bt.textContent = n.class === 'deprecated' ? 'محذوف' : 'ميت';
      }
      txtRight(g, nodeW(n) - 11, 42, n.path.length > 31 ? n.path.slice(0, 30) + '…' : n.path, { size: 9.6, fill: '#5b6b7e', mono: true, ltr: true });
      g.addEventListener('click', function (ev) { ev.stopPropagation(); openDetail(n.id); });
    });
  }

  function renderLegend() {
    var lx = 20, ly = layout.H - 12;
    var g = el('g', { transform: 'translate(' + lx + ',' + (ly - 118) + ')', id: 'legend' }, svg);
    el('rect', { width: layout.W - 40, height: 118, rx: 12, fill: 'rgba(255,255,255,.92)', stroke: '#d7e2e0' }, g);
    txtRight(g, layout.W - 60, 20, 'المفتاح — Legend', { size: 11.5, weight: 800, fill: '#33475c' });
    var cls = CLASSES.filter(function (c) { return c !== 'shell'; });
    cls.forEach(function (c, i) {
      var cm = CLASS_META[c]; var col = i % 4, row = Math.floor(i / 4);
      var x = layout.W - 74 - col * ((layout.W - 100) / 4), y = 40 + row * 17;
      el('rect', { x: x - 14, y: y - 9, width: 11, height: 11, rx: 3, fill: cm.fill, stroke: cm.stroke }, g);
      txtRight(g, x - 20, y, cm.ar, { size: 9.8, fill: '#33475c' });
    });
    KINDS.forEach(function (k, i) {
      var km = KIND_META[k]; var col = i % 4, row = Math.floor(i / 4);
      var x = layout.W - 74 - col * ((layout.W - 100) / 4), y = 78 + row * 15;
      el('path', { d: 'M ' + (x - 18) + ' ' + y + ' L ' + (x - 7) + ' ' + y, stroke: km.color, 'stroke-width': 2, 'stroke-dasharray': km.dash || '', 'marker-end': 'url(#arr-' + k + ')' }, g);
      txtRight(g, x - 24, y + 3.5, km.ar, { size: 9.6, fill: '#33475c' });
    });
  }

  /* ================= interaction ================= */
  function applyFilters() {
    renderEdges(); renderNodes(); updateCounts(); updateStats();
  }

  function updateCounts() {
    NODES.forEach(function (n) {
      var row = document.querySelector('.frow[data-class="' + n.class + '"] .count');
      if (row) row.textContent = '';
    });
    var cnt = {};
    NODES.forEach(function (n) { cnt[n.class] = (cnt[n.class] || 0) + 1; });
    CLASSES.forEach(function (c) {
      var row = document.querySelector('.frow[data-class="' + c + '"]');
      if (row) { row.querySelector('.count').textContent = cnt[c] || 0; row.classList.toggle('dim', !state.classes[c]); }
    });
  }
  function updateStats() {
    var nv = NODES.filter(nodeVisible).length, ev = EDGES.filter(edgeVisible).length;
    document.getElementById('stats-chip').textContent = nv + ' nodes · ' + ev + ' edges · ' + EDGES.filter(function (e) { return e.isDeadOrConfusing && edgeVisible(e); }).length + ' red';
  }

  function openDetail(nodeId, focusEdgeId) {
    var n = byId[nodeId]; if (!n) return;
    state.selected = nodeId; renderNodes();
    var cm = CLASS_META[n.class];
    var panel = document.getElementById('detail');
    var html = '<button class="close" aria-label="إغلاق">✕</button>';
    html += '<span class="kind" style="color:' + cm.stroke + ';background:' + cm.fill + '">' + cm.ar + ' (' + cm.en + ')</span>';
    html += '<h2>' + n.labelAr + (n.class === 'legacy' ? ' <span style="color:#dc2626">— ميت/موروث</span>' : '') + '</h2>';
    html += '<span class="path">' + esc(n.path) + '</span>';
    html += '<div class="comp">' + esc(n.component) + '</div>';
    if (n.labelEn) html += '<div class="comp" style="margin-top:2px">' + esc(n.labelEn) + '</div>';
    if (n.notes) html += '<div class="notes">' + esc(n.notes) + '</div>';
    if (n.unverified) html += '<div class="notes" style="border-color:#d97706">UNVERIFIED — غير مُثبَت تحليلياً</div>';
    var incoming = EDGES.filter(function (e) { return e.to === n.id; });
    var outgoing = EDGES.filter(function (e) { return e.from === n.id; });
    html += '<h4>واردة — ' + incoming.length + '</h4><ul class="edge-list">';
    incoming.forEach(function (e) { html += edgeRow(e, 'من', e.from, focusEdgeId === e.id); });
    html += '</ul><h4>صادرة — ' + outgoing.length + '</h4><ul class="edge-list">';
    outgoing.forEach(function (e) { html += edgeRow(e, 'إلى', e.to, focusEdgeId === e.id); });
    html += '</ul>';
    panel.innerHTML = html;
    panel.classList.add('open');
    panel.querySelector('.close').addEventListener('click', closeDetail);
    panel.querySelectorAll('.edge-list li').forEach(function (li) {
      li.addEventListener('click', function () {
        var id = li.getAttribute('data-node'); if (id) openDetail(id, li.getAttribute('data-edge'));
      });
    });
  }
  function edgeRow(e, dirWord, otherId, focus) {
    var other = byId[otherId]; var km = KIND_META[e.kind];
    var red = e.isDeadOrConfusing ? ' redrow' : '';
    return '<li class="' + (focus ? 'hl' : '') + red + '" data-node="' + otherId + '" data-edge="' + e.id + '" style="' + (focus ? 'border-color:#0f766e;border-width:2px;' : '') + '">'
      + '<span class="dir">' + dirWord + ':</span> ' + esc(other.labelAr)
      + '<span class="kbadge" style="color:' + (e.isDeadOrConfusing ? '#dc2626' : km.color) + ';border:1px solid currentColor">' + km.ar + '</span>'
      + '<span class="tg">' + esc(e.triggerAr) + '</span>'
      + '<span class="who">' + esc(e.triggerEn) + ' · ' + esc(other.path) + '</span>'
      + (e.notes ? '<span class="tg" style="color:#94a3b8">' + esc(e.notes) + '</span>' : '')
      + '</li>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function closeDetail() { document.getElementById('detail').classList.remove('open'); state.selected = null; renderNodes(); }

  /* search */
  function runSearch(q) {
    state.query = q.trim();
    if (!state.query) { renderEdges(); renderNodes(); return; }
    var needle = state.query.toLowerCase();
    var hits = {};
    NODES.forEach(function (n) {
      if ((n.labelAr || '').indexOf(state.query) >= 0
        || (n.path || '').toLowerCase().indexOf(needle) >= 0
        || (n.component || '').toLowerCase().indexOf(needle) >= 0
        || (n.labelEn || '').toLowerCase().indexOf(needle) >= 0) hits[n.id] = true;
    });
    EDGES.forEach(function (e) { if (hits[e.from] || hits[e.to]) return; });
    NODES.forEach(function (n) {
      var g = document.querySelector('.node[data-id="' + n.id + '"]');
      if (g) g.classList.toggle('dimmed', !hits[n.id] && !state._searchAll);
    });
    // keep edges that touch a hit visible; dim the rest
    document.querySelectorAll('.edge').forEach(function (p) {
      var e = EDGES.filter(function (x) { return x.id === p.getAttribute('data-id'); })[0];
      var touch = e && (hits[e.from] || hits[e.to]);
      p.classList.toggle('dimmed', !(touch && edgeVisible(e)));
    });
    var first = Object.keys(hits)[0];
    if (first) { state.selected = first; renderNodes(); openDetail(first); }
    var count = Object.keys(hits).length;
    document.getElementById('search-count').textContent = count ? (count + ' نتيجة') : 'لا نتائج';
  }

  /* pan/zoom */
  var view = { x: 0, y: 0, k: 1 };
  function applyView() {
    svg.setAttribute('style', 'position:absolute;top:0;right:0;transform-origin:top right;transform:translate(' + (-view.x) + 'px,' + (-view.y) + 'px) scale(' + view.k + ')');
    document.getElementById('zoomlabel').textContent = Math.round(view.k * 100) + '%';
  }
  function fit() {
    var stage = document.getElementById('stage');
    var k = Math.min(stage.clientWidth / layout.W, stage.clientHeight / layout.H) * 0.97;
    view.k = k; view.x = 0; view.y = 0; applyView();
  }
  function zoomAt(factor, cx, cy) {
    var nk = Math.max(0.2, Math.min(3, view.k * factor));
    var stage = document.getElementById('stage').getBoundingClientRect();
    var px = (cx == null ? stage.width / 2 : cx), py = (cy == null ? stage.height / 2 : cy);
    // keep the point under the cursor stable
    view.x = px - (px + view.x) * (nk / view.k);
    view.y = py - (py + view.y) * (nk / view.k);
    view.k = nk; applyView();
  }

  /* export */
  window.__exportSVG = function () {
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('style', 'background:#ffffff');
    // inline the essential node/edge css for standalone viewing
    var css = 'text{font-family:"Noto Sans Arabic","Segoe UI",Tahoma,sans-serif} .edge{fill:none} .node{cursor:pointer} .node:hover rect.body{filter:brightness(.96)}';
    var styleEl = document.createElementNS(SVG_NS, 'style');
    styleEl.textContent = css;
    clone.insertBefore(styleEl, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  };

  window.__LAYOUT = { W: layout.W, H: layout.H };

  /* ================= boot ================= */
  function buildSidebar() {
    var sb = document.getElementById('sidebar');
    var clsCounts = {}; NODES.forEach(function (n) { clsCounts[n.class] = (clsCounts[n.class] || 0) + 1; });
    var h = '<div class="modes">'
      + '<button id="btn-red" class="redmode">الأحمر فقط</button>'
      + '<button id="btn-study">تبويبات دراستي</button>'
      + '<button id="btn-reset2" style="flex-basis:100%">إعادة تعيين الكل</button>'
      + '</div>';
    h += '<h3>تصنيف العقد <button class="reset" id="cls-all">الكل</button></h3><div class="fgroup">';
    CLASSES.forEach(function (c) {
      var cm = CLASS_META[c];
      h += '<label class="frow" data-class="' + c + '"><input type="checkbox" checked data-cls="' + c + '">'
        + '<span class="swatch" style="border-color:' + cm.stroke + ';background:' + cm.fill + '"></span>'
        + '<span>' + cm.ar + '</span><span class="count"></span></label>';
    });
    h += '</div><h3>أنواع الحواف <button class="reset" id="kinds-all">الكل</button></h3><div class="fgroup">';
    KINDS.forEach(function (k) {
      var km = KIND_META[k];
      h += '<label class="frow"><input type="checkbox" checked data-kind="' + k + '">'
        + '<svg width="26" height="10" style="flex:0 0 26px"><line x1="0" y1="5" x2="22" y2="5" stroke="' + km.color + '" stroke-width="2" ' + (km.dash ? 'stroke-dasharray="' + km.dash + '"' : '') + '/><polygon points="22,1.5 26,5 22,8.5" fill="' + km.color + '"/></svg>'
        + '<span>' + km.ar + '</span></label>';
    });
    h += '</div><div class="legend-note"><b>قراءة الأحمر:</b> المسارات الموروثة التحويلية وحواف «العودة للرئيسية» إلى الجذر وأزرار الرجوع المعتمدة على التاريخ — كلها معنّرة بـ<b>ميت/موروث</b> + خط أحمر متقطع (لا لون وحده).</div>'
      + '<div class="legend-note" style="margin-top:8px">المصدر: <span style="font-family:ui-monospace,monospace;direction:ltr;display:inline-block">data/graph.json</span> — 37/37 مسار من router.tsx.</div>';
    sb.innerHTML = h;
    sb.querySelectorAll('input[data-cls]').forEach(function (cb) {
      cb.addEventListener('change', function () { state.classes[cb.getAttribute('data-cls')] = cb.checked; applyFilters(); });
    });
    sb.querySelectorAll('input[data-kind]').forEach(function (cb) {
      cb.addEventListener('change', function () { state.kinds[cb.getAttribute('data-kind')] = cb.checked; applyFilters(); });
    });
    document.getElementById('cls-all').addEventListener('click', function () {
      CLASSES.forEach(function (c) { state.classes[c] = true; });
      sb.querySelectorAll('input[data-cls]').forEach(function (cb) { cb.checked = true; });
      state.redOnly = false; state.studyOnly = false; syncModeButtons(); applyFilters();
    });
    document.getElementById('kinds-all').addEventListener('click', function () {
      KINDS.forEach(function (k) { state.kinds[k] = true; });
      sb.querySelectorAll('input[data-kind]').forEach(function (cb) { cb.checked = true; });
      applyFilters();
    });
    document.getElementById('btn-red').addEventListener('click', function () {
      state.redOnly = !state.redOnly; if (state.redOnly) state.studyOnly = false; syncModeButtons(); applyFilters();
    });
    document.getElementById('btn-study').addEventListener('click', function () {
      state.studyOnly = !state.studyOnly; if (state.studyOnly) state.redOnly = false; syncModeButtons(); applyFilters();
    });
    document.getElementById('btn-reset2').addEventListener('click', function () {
      CLASSES.forEach(function (c) { state.classes[c] = true; });
      KINDS.forEach(function (k) { state.kinds[k] = true; });
      state.redOnly = state.studyOnly = false; state.query = '';
      document.getElementById('search-input').value = ''; document.getElementById('search-count').textContent = '';
      sb.querySelectorAll('input[type=checkbox]').forEach(function (cb) { cb.checked = true; });
      syncModeButtons(); applyFilters();
    });
    function syncModeButtons() {
      document.getElementById('btn-red').classList.toggle('active', state.redOnly);
      document.getElementById('btn-study').classList.toggle('active', state.studyOnly);
    }
  }

  function boot() {
    renderStaticFrame();
    renderEdges(); renderNodes(); renderLegend();
    buildSidebar(); updateCounts(); updateStats();

    var isStatic = location.search.indexOf('static=1') >= 0;
    if (isStatic) {
      document.body.classList.add('static');
      view.k = 1; view.x = 0; view.y = 0;
      svg.setAttribute('style', 'position:absolute;top:0;left:0;background:#ffffff');
      return;
    }

    // search
    var input = document.getElementById('search-input');
    var deb;
    input.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(function () { runSearch(input.value); }, 180); });
    // keyboard
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeDetail();
      if (ev.key === '/' && document.activeElement !== input) { ev.preventDefault(); input.focus(); }
    });
    // pan
    var stage = document.getElementById('stage');
    var drag = null;
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.node, .edge, .stage-toolbar')) return;
      drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
      stage.classList.add('dragging'); stage.setPointerCapture(ev.pointerId);
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      view.x = drag.vx - (ev.clientX - drag.x); view.y = drag.vy - (ev.clientY - drag.y); applyView();
    });
    stage.addEventListener('pointerup', function () { drag = null; stage.classList.remove('dragging'); });
    stage.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = stage.getBoundingClientRect();
      zoomAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
    // toolbar
    document.getElementById('z-in').addEventListener('click', function () { zoomAt(1.2); });
    document.getElementById('z-out').addEventListener('click', function () { zoomAt(1 / 1.2); });
    document.getElementById('z-fit').addEventListener('click', fit);
    document.getElementById('z-1').addEventListener('click', function () { view.k = 1; view.x = view.y = 0; applyView(); });
    document.getElementById('btn-export').addEventListener('click', function () {
      var blob = new Blob([window.__exportSVG()], { type: 'image/svg+xml' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'student-web-nav-export.svg'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    fit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
