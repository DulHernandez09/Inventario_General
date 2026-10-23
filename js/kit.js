/*
 * kit.js — componentes de interfaz compartidos (formato de cifras, tablas, gráficas y filtros).
 * Solo generan HTML a partir de los datos que entrega js/engine.js; no calculan inventario.
 */
(function (g) {
  'use strict';
  function create(D) {
    var ND = D.dates.length, cache = {};
    function inSet(arr, v) { return arr.indexOf(v) >= 0; }
var nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
var mf = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'], DOW = ['dom','lun','mar','mié','jue','vie','sáb'];
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pz(v) { return nf.format(Math.round(v)); }
function money(v) { return (v < 0 ? '−$' : '$') + mf.format(Math.abs(v)); }
function money0(v) { return (v < 0 ? '−$' : '$') + nf.format(Math.abs(Math.round(v))); }
function sg(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + nf.format(Math.abs(Math.round(v))); }
function sgm(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + '$' + mf.format(Math.abs(v)); }
function pcs(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%'; }
function arrow(v) { return v > 0 ? '▲' : v < 0 ? '▼' : '='; }
function cls(v) { return v > 0 ? 'up' : v < 0 ? 'dn' : ''; }
function dl(i) { var p = D.dates[i].split('-'); return +p[2] + ' ' + MES[+p[1] - 1]; }
function dow(i) { return DOW[new Date(D.dates[i] + 'T12:00:00').getDay()]; }
function multisel(id, label, opts, selArr, searchable, right, open) {
  var use = selArr.length > 0 && selArr.length < opts.length;
  var names = opts.filter(function (o) { return inSet(selArr, o.v); }).map(function (o) { return o.label; });
  var sum = !use ? 'Todas' : names.length <= 2 ? names.join(', ') : names.length + ' seleccionadas';
  var h = '<div class="fg" style="flex:1 1 170px"><div class="lbl" id="l-' + id + '">' + esc(label) + '</div>' +
    '<button type="button" class="fld" data-a="open" data-v="' + id + '" aria-haspopup="true" aria-expanded="' + (open === id) + '" aria-labelledby="l-' + id + '"><span>' + esc(sum) + '</span><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>';
  if (open === id) {
    h += '<div class="backdrop" data-a="close"></div><div class="pop' + (right ? ' r' : '') + '" role="group" aria-label="' + esc(label) + '">' +
      (searchable ? '<div class="srch"><input class="fld" type="text" placeholder="Buscar…" data-filter="1" aria-label="Buscar"></div>' : '') +
      '<div class="bar1"><button type="button" class="lnk" data-a="all" data-g="' + id + '">Seleccionar todas</button><button type="button" class="lnk m" data-a="none" data-g="' + id + '">Limpiar</button></div><div class="list">' +
      opts.map(function (o) { return '<label class="opt"><input type="checkbox" data-a="chk" data-g="' + id + '" data-v="' + o.v + '"' + (inSet(selArr, o.v) ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>'; }).join('') +
      '</div><div class="foot"><span>' + (use ? names.length : opts.length) + ' de ' + opts.length + '</span><button type="button" class="ok" data-a="close">Aplicar</button></div></div>';
  }
  return h + '</div>';
}
function tipAttr(html) { return ' data-tip="' + esc(html) + '"'; }
function storeCell(st, unit, title) {
  var ks = Object.keys(st).sort(function (a, b) { return st[b] - st[a]; });
  var txt = esc(D.dims.t[+ks[0]]) + (ks.length > 1 ? ' +' + (ks.length - 1) : '');
  if (ks.length < 2) return '<div class="ell">' + txt + '</div>';
  var t = '<div class="h">' + esc(title) + '</div>' + ks.map(function (k) { return '<div class="l"><span>' + esc(D.dims.t[+k]) + '</span><b>' + pz(st[k]) + ' ' + unit + '</b></div>'; }).join('');
  return '<div class="ell dot"' + tipAttr(t) + '>' + txt + '</div>';
}
function skuBtn(k) { return '<button type="button" class="sku" data-a="sku" data-v="' + esc(D.skus[k]) + '" title="Buscar este SKU">' + esc(D.skus[k]) + '</button>'; }
function two(q, v, uq) { return '<div class="two"><span class="num"><b>' + q + '</b> ' + (uq || 'pzs') + '</span><small class="num">' + v + '</small></div>'; }
/* ---------- gráficas de tendencia ---------- */
function niceStep(mx) { var mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, mx)))); return Math.ceil(mx * 1.15 / 4 / (mag / 10)) * (mag / 10); }
function comboChart(uv, vv, C, tips, gray) {
  var VW = 940, VH = 300, L = 100, R = 124, T = 28, B = 30, n = uv.length, pw = VW - L - R, ph = VH - T - B, slot = pw / n, i;
  var stp = niceStep(Math.max.apply(null, uv.concat([1]))), hiU = stp * 4;
  var mn = Math.min.apply(null, vv), mx = Math.max.apply(null, vv), rg = mx - mn || Math.max(1, mx * 0.05), lo = Math.max(0, mn - rg * 0.6), hi = mx + rg * 0.35;
  function X(j) { return L + (j + 0.5) * slot; } function YV(v) { return T + (1 - (v - lo) / (hi - lo)) * ph; }
  var s = '<svg class="ch' + (gray ? ' gray' : '') + '" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Tendencia de piezas (barras) y valor a costo (línea) por corte">';
  for (i = 0; i <= 4; i++) { var y = T + ph * (1 - i / 4); s += '<line class="gl" x1="' + L + '" x2="' + (VW - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + pz(stp * i) + '</text><text class="ax" x="' + (VW - R + 8) + '" y="' + (y + 3.5).toFixed(1) + '" fill="#8A5F00" style="fill:#8A5F00">' + money0(lo + (hi - lo) * i / 4) + '</text>'; }
  var bw = Math.min(58, slot * 0.5);
  uv.forEach(function (v, j) { var h = Math.max(0, v / hiU * ph), x = X(j) - bw / 2, y = T + ph - h, r = Math.min(4, h / 2);
    s += '<path class="bar" data-ti="' + j + '" style="animation-delay:' + (j * 70) + 'ms" d="M' + x.toFixed(1) + ' ' + (T + ph) + 'V' + (y + r).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ' ' + y.toFixed(1) + 'H' + (x + bw - r).toFixed(1) + 'Q' + (x + bw).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + bw).toFixed(1) + ' ' + (y + r).toFixed(1) + 'V' + (T + ph) + 'Z"/>';
    s += '<text class="vl" x="' + X(j).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle" style="animation:fadeIn .6s ' + (400 + j * 70) + 'ms both">' + pz(v) + '</text>'; });
  var path = vv.map(function (v, j) { return (j ? 'L' : 'M') + X(j).toFixed(1) + ' ' + YV(v).toFixed(1); }).join(' ');
  s += '<defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C99700" stop-opacity=".34"/><stop offset="1" stop-color="#C99700" stop-opacity=".02"/></linearGradient></defs>';
  if (n > 1) s += '<path class="area" d="' + path + ' L' + X(n - 1).toFixed(1) + ' ' + (T + ph) + ' L' + X(0).toFixed(1) + ' ' + (T + ph) + 'Z" fill="url(#gA)"/>';
  s += '<path class="ln halo draw" pathLength="1" d="' + path + '"/><path class="ln draw" pathLength="1" d="' + path + '"/>' + (n > 1 ? '<path class="ln shine" pathLength="1" d="' + path + '"/>' : '');
  vv.forEach(function (v, j) { s += '<circle class="pt" data-ti="' + j + '" r="4.5" cx="' + X(j).toFixed(1) + '" cy="' + YV(v).toFixed(1) + '" style="animation-delay:' + (500 + j * 120) + 'ms"/>'; });
  C.sel.forEach(function (di, j) { s += '<text class="ax" x="' + X(j).toFixed(1) + '" y="' + (VH - 9) + '" text-anchor="middle">' + dl(di) + '</text>'; });
  uv.forEach(function (v, j) { s += '<line class="xh" data-ti="' + j + '" x1="' + X(j).toFixed(1) + '" x2="' + X(j).toFixed(1) + '" y1="' + T + '" y2="' + (T + ph) + '"/>'; });
  uv.forEach(function (v, j) { s += '<rect class="hit" data-ti="' + j + '" x="' + (L + j * slot).toFixed(1) + '" y="0" width="' + slot.toFixed(1) + '" height="' + VH + '"' + tipAttr(tips[j]) + '/>'; });
  return s + '</svg>';
}

/* ---------- pasteles (aros) ---------- */
var PAL = ['#1F5FAE', '#E8590C', '#0B9A8D', '#B8862B', '#6A5BB0', '#C2557A', '#4D9BD6', '#8E6E53', '#5C7A29'], OTH = '#A3ADB8';
function rankMap(kind) {
  var key = 'rk' + kind; if (cache[key]) return cache[key];
  var tt = {}; D.st.forEach(function (r) { if (r[5] !== ND - 1) return; if (kind === 'c') { if (r[0] <= 1) tt[r[3]] = (tt[r[3]] || 0) + r[7]; } else if (r[0] === 0) { var k = kind === 'u' ? r[4] : r[1]; tt[k] = (tt[k] || 0) + r[7]; } });
  function pin(k) { return kind === 'u' && /hub|proveedor/i.test(D.dims.u[k]) ? 1 : 0; }
  var ks = Object.keys(tt).map(Number).sort(function (a, b) { return (pin(b) - pin(a)) || tt[b] - tt[a]; }), m = {};
  ks.forEach(function (k, i) { if (i < PAL.length) m[k] = i; });
  return cache[key] = m;
}
var uid = 0;
function arc(a0, a1, R, r, cx, cy) {
  function pt(a, rad) { var th = a * Math.PI / 180; return [(cx + rad * Math.sin(th)).toFixed(2), (cy - rad * Math.cos(th)).toFixed(2)]; }
  var lg = a1 - a0 > 180 ? 1 : 0, p1 = pt(a0, R), p2 = pt(a1, R), p3 = pt(a1, r), p4 = pt(a0, r);
  return 'M' + p1 + 'A' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + p2 + 'L' + p3 + 'A' + r + ' ' + r + ' 0 ' + lg + ' 0 ' + p4 + 'Z';
}
/* Aro con los datos dentro de la misma gráfica: cada rebanada tiene una flecha hacia su etiqueta (nombre, piezas, valor y %). */
function donutSvg(items, key, isMoney, label, rk, nameOf, act, selFn, tipExtra, ranked) {
  var tot = items.reduce(function (a, r) { return a + Math.max(0, r[key]); }, 0), main = [], oth = { q: 0, v: 0, names: [] }, id = ++uid;
  items.forEach(function (r) { if (rk[r.k] != null) main.push(r); else { oth.q += r.q; oth.v += r.v; oth.names.push(r); } });
  main.sort(function (a, b) { return b[key] - a[key]; });   // de mayor a menor, en el sentido del reloj desde arriba (el color de cada elemento no cambia)
  var sl = main.map(function (r, i) { return { r: r, k: r.k, col: PAL[rk[r.k]], name: (ranked ? (i + 1) + '. ' : '') + nameOf(r.k) }; });
  if (oth.names.length) sl.push({ r: oth, k: -1, col: OTH, name: 'Otros (' + oth.names.length + ')', rest: oth.names });
  var acc = 0, W = 700, R = 110, r0 = 58, cx = W / 2, i;
  sl.forEach(function (x) { var pc = tot ? Math.max(0, x.r[key]) / tot : 0; x.pc = pc; x.a0 = acc * 360; x.a1 = Math.min((acc + pc) * 360, 359.99); acc += pc; x.mid = (x.a0 + x.a1) / 2 * Math.PI / 180; x.sn = Math.sin(x.mid); x.cs = Math.cos(x.mid); });
  sl = sl.filter(function (x) { return x.pc > 0; });
  var GAP = 50, sides = [sl.filter(function (x) { return x.sn >= 0; }), sl.filter(function (x) { return x.sn < 0; })], mx = Math.max(sides[0].length, sides[1].length, 1);
  var H = Math.max(330, mx * GAP + 40), cy = H / 2;
  sides.forEach(function (L) {
    L.forEach(function (x) { x.ly = cy - (R + 22) * x.cs; });
    L.sort(function (a, b) { return a.ly - b.ly; });
    var top = 26; L.forEach(function (x) { x.ly = Math.max(x.ly, top); top = x.ly + GAP; });
    var over = L.length ? L[L.length - 1].ly - (H - 26) : 0; if (over > 0) L.forEach(function (x) { x.ly -= over; });
    for (i = L.length - 1; i > 0; i--) if (L[i].ly - L[i - 1].ly < GAP) L[i - 1].ly = L[i].ly - GAP;
  });
  var cols = {}; sl.forEach(function (x) { cols[x.col] = 1; });
  var s = '<svg class="donut" viewBox="0 0 ' + W + ' ' + H.toFixed(0) + '" role="img" aria-label="Aro de ' + esc(label) + '"><defs>' +
    Object.keys(cols).map(function (c, j) { return '<marker id="mk' + id + '_' + j + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="' + c + '"/></marker>'; }).join('') + '</defs>';
  var keys = Object.keys(cols);
  sl.forEach(function (x) {
    var side = x.sn >= 0 ? 1 : -1, p0 = [cx + (R + 5) * x.sn, cy - (R + 5) * x.cs], ex = cx + side * (R + 22), lx = cx + side * (R + 42), ly = x.ly;
    var main1 = isMoney ? money(x.r.v) : pz(x.r.q) + ' pzs', sec = isMoney ? pz(x.r.q) + ' pzs' : money(x.r.v), on = x.k >= 0 && selFn && selFn(x.k);
    var t = '<div class="h">' + esc(x.name) + '</div><div class="l"><span>Piezas</span><b>' + pz(x.r.q) + '</b></div><div class="l"><span>Valor a costo</span><b>' + money(x.r.v) + '</b></div><div class="sp">' + (x.pc * 100).toFixed(2) + '% de ' + (isMoney ? 'el valor' : 'las piezas') + '</div>';
    if (x.rest) t += '<div class="sp">' + x.rest.slice(0, 8).map(function (z) { return esc(nameOf(z.k)) + ' · ' + pz(z.q) + ' pzs'; }).join('<br>') + '</div>';
    if (tipExtra) t += tipExtra(x.rest ? x.rest.map(function (z) { return z.k; }) : [x.k]);
    s += '<g class="gp' + (on ? ' on' : '') + '"' + (x.k >= 0 && act ? ' data-a="' + act + '" data-v="' + x.k + '"' : '') + tipAttr(t) + ' data-cv="' + esc(isMoney ? money(x.r.v) : pz(x.r.q)) + '" data-cl="' + esc(x.name + ' · ' + (x.pc * 100).toFixed(2) + '%') + '">' +
      '<path class="sl" d="' + arc(x.a0, Math.max(x.a0, x.a1 - (x.pc > 0.02 ? 0.5 : 0.1)), R, r0, cx, cy) + '" fill="' + x.col + '" style="--tx:' + (11 * x.sn).toFixed(1) + 'px;--ty:' + (-11 * x.cs).toFixed(1) + 'px"/>' +
      '<path class="arw" d="M' + lx + ' ' + ly.toFixed(1) + 'H' + ex + 'L' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + '" fill="none" stroke="' + x.col + '" stroke-width="1.5" marker-end="url(#mk' + id + '_' + keys.indexOf(x.col) + ')"/>' +
      '<text class="lt" x="' + (lx + side * 6) + '" y="' + (ly - 11).toFixed(1) + '" text-anchor="' + (side > 0 ? 'start' : 'end') + '"><tspan class="n1" x="' + (lx + side * 6) + '">' + esc(x.name) + '</tspan><tspan class="n2" x="' + (lx + side * 6) + '" dy="14">' + esc(main1) + ' · ' + (x.pc * 100).toFixed(2) + '%</tspan><tspan class="n3" x="' + (lx + side * 6) + '" dy="13">' + esc(sec) + '</tspan></text></g>';
  });
  var cv = isMoney ? money(tot) : pz(tot);
  return s + '<text class="cv" x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" style="font-size:' + (isMoney ? 13 : 17) + 'px" data-o="' + esc(cv) + '">' + esc(cv) + '</text><text class="cl" x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" data-o="' + esc(label) + '">' + esc(label) + '</text></svg>';
}
function donutSection(tagCls, title, sub, map, nameOf, act, selFn, kind, emptyMsg, opts) {
  opts = opts || {};
  var rows = Object.keys(map).map(Number).map(function (k) { return { k: k, q: map[k].q, v: map[k].v }; }).filter(function (r) { return r.q > 0 || r.v > 0; }).sort(function (a, b) { return b.v - a.v; });
  var h = '<section class="card sec" aria-label="' + esc(title) + '"><div class="sechead"><div class="l"><h2 class="tag ' + tagCls + '">' + esc(title) + '</h2><span class="sub">' + sub + '</span></div></div>';
  if (!rows.length) return h + '<div class="empty">' + emptyMsg + '</div></section>';
  var rk = rankMap(kind);
  var dq = '<div class="dcard"><h3>Piezas</h3>' + donutSvg(rows, 'q', false, 'piezas', rk, nameOf, act, selFn, opts.tipExtra, opts.ranked) + '</div>', dv = '<div class="dcard"><h3>Valor a costo</h3>' + donutSvg(rows, 'v', true, 'valor a costo', rk, nameOf, act, selFn, opts.tipExtra, opts.ranked) + '</div>';
  if (opts.only === 'q') return h + '<div class="dgrid" style="grid-template-columns:minmax(0,860px);justify-content:center">' + dq + '</div></section>';
  if (opts.only === 'v') return h + '<div class="dgrid" style="grid-template-columns:minmax(0,860px);justify-content:center">' + dv + '</div></section>';
  return h + '<div class="dgrid">' + dq + dv + '</div></section>';
}

function barlist(map, nameOf, act, selFn, emptyMsg, small) {
  var rows = Object.keys(map).map(Number).map(function (k) { return { k: k, q: map[k].q, v: map[k].v }; }).filter(function (r) { return r.q > 0 || r.v > 0; }).sort(function (a, b) { return b.v - a.v; });
  if (!rows.length) return '<div class="empty">' + emptyMsg + '</div>';
  var TQ = rows.reduce(function (a, r) { return a + Math.max(0, r.q); }, 0), TV = rows.reduce(function (a, r) { return a + Math.max(0, r.v); }, 0), mq = Math.max.apply(null, rows.map(function (r) { return r.q; }).concat([1])), mv2 = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1]));
  return '<div class="tw"><div class="bl' + (small ? ' sm' : '') + '" style="min-width:' + (small ? 520 : 700) + 'px"><div class="blh"><div>' + (act === 'pu' ? 'Ubicación' : 'Almacén') + '</div><div>Piezas</div><div>Valor a costo</div></div>' + rows.map(function (r, j) {
    var on = selFn(r.k);
    return '<button type="button" class="blr' + (on ? ' on' : '') + '" data-a="' + act + '" data-v="' + r.k + '" aria-pressed="' + on + '" style="animation-delay:' + (j * 60) + 'ms"><div class="nm" title="' + esc(nameOf(r.k)) + '">' + esc(nameOf(r.k)) + '</div>' +
      '<div class="cell"><div class="trk"><div class="fill" style="--w:' + Math.max(.5, r.q / mq * 100).toFixed(1) + '%;background:var(--navy);animation-delay:' + (150 + j * 70) + 'ms"></div></div><div class="t num"><b>' + pz(r.q) + '</b> <s>pzs · ' + (TQ ? r.q / TQ * 100 : 0).toFixed(2) + '%</s></div></div>' +
      '<div class="cell vv"><div class="trk"><div class="fill" style="--w:' + Math.max(.5, r.v / mv2 * 100).toFixed(1) + '%;background:var(--gold);animation-delay:' + (250 + j * 70) + 'ms"></div></div><div class="t num"><b>' + money(r.v) + '</b> <s>· ' + (TV ? r.v / TV * 100 : 0).toFixed(2) + '%</s></div></div></button>'; }).join('') + '</div></div>';
}
    function wire(o) {
      var app = o.app, tip = o.tip, S = o.S, setS = o.setS, E = o.E, extra = o.extra || {};
function toggle(arr, v) { var k = arr.indexOf(v); var n = arr.slice(); if (k >= 0) n.splice(k, 1); else n.push(v); return n; }
function resetDims() { return { ts: [], cs: [], us: [], ch: -1, open: null, lrB: 'all', lrT: 'all' }; }
app.addEventListener('click', function (e) {
  var el = e.target.closest('[data-a]'); if (!el) return;
  var a = el.getAttribute('data-a'), v = el.getAttribute('data-v'), g = el.getAttribute('data-g');
  if (extra[a]) { extra[a](el, v, g); return; }
  var all = { t: function () { return E.options(E.srcFilter(S))[1]; }, c: function () { return E.options(E.srcFilter(S))[2]; }, u: function () { return E.options(E.srcFilter(S))[3]; } };
  var key = { d: 'ds', t: 'ts', c: 'cs', u: 'us' };
  switch (a) {
    case 'open': setS({ open: S.open === v ? null : v }); break;
    case 'close': setS({ open: null }); break;
    case 'mode': setS(Object.assign(resetDims(), { mode: v, et: 't' })); break;
    case 'et': setS({ et: v, ch: -1, us: [] }); break;
    case 'tile': if (el.disabled) break; setS(Object.assign({ mode: 'erp', et: v, ch: -1, us: [] }, S.mode === 'erp' ? {} : { ts: [], cs: [] })); break;
    case 'ch': setS({ ch: +v }); break;
    case 'chk':
      var cur = g === 'd' && !S.ds.length ? D.dates.map(function (x, k) { return k; }) : S[key[g]], ng = toggle(cur, +v);
      if (g === 'd') { if (!ng.length) ng = cur; else if (ng.length === ND) ng = []; }
      S[key[g]] = ng; setS({}); break;
    case 'all': setS((function () { var o = {}; o[key[g]] = all[g]().map(function (x) { return x.v; }); return o; })()); break;
    case 'none': setS((function () { var o = {}; o[key[g]] = []; return o; })()); break;
    case 'dpre': setS({ ds: v === 'all' ? [] : v === 'last' ? [ND - 1] : [ND - 2, ND - 1] }); break;
    case 'sort': setS({ sort: v }); break;
    case 'lrb': setS({ lrB: v }); break;
    case 'lrt': setS({ lrT: S.lrT === v ? 'all' : v, lrB: 'all' }); break;
    case 'sku': setS({ q: v }); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'pu': setS({ us: S.us.length === 1 && S.us[0] === +v ? [] : [+v] }); break;
    case 'pa': setS({ ch: S.ch === +v ? -1 : +v }); break;
    case 'chip': setS(v === 'ch' ? { ch: -1 } : v === 'us' ? { us: [] } : { q: '' }); break;
    case 'newl': setS({ showNew: !S.showNew }); break;
    case 'clear': setS(Object.assign(resetDims(), { mode: 'all', et: 't', q: '', ds: [], sort: 'total' })); break;
  }
});
app.addEventListener('change', function (e) { if (e.target.id === 'f-q') setS({ q: e.target.value }); });
app.addEventListener('keydown', function (e) { if (e.target.id === 'f-q' && e.key === 'Enter') setS({ q: e.target.value }); });
app.addEventListener('input', function (e) {
  if (!e.target.hasAttribute('data-filter')) return;
  var t = e.target.value.trim().toLowerCase();
  e.target.closest('.pop').querySelectorAll('.opt').forEach(function (l) { l.style.display = !t || l.textContent.toLowerCase().indexOf(t) >= 0 ? '' : 'none'; });
});
/* tooltip y resaltado de la tendencia */
var hovI = -1;
function hl(i) {
  var w = document.getElementById('trend'); if (!w) return;
  w.querySelectorAll('.hl').forEach(function (x) { x.classList.remove('hl'); });
  if (i >= 0) w.querySelectorAll('[data-ti="' + i + '"]').forEach(function (x) { x.classList.add('hl'); });
  w.classList.toggle('hv', i >= 0);
}
document.addEventListener('mouseover', function (e) {
  var sl = e.target.closest ? e.target.closest('.gp') : null;
  document.querySelectorAll('.donut[data-hot]').forEach(function (dn) {
    if (sl && sl.closest('.donut') === dn) return;
    dn.removeAttribute('data-hot'); ['cv', 'cl'].forEach(function (c) { var n = dn.querySelector('.' + c); n.textContent = n.getAttribute('data-o'); });
  });
  if (sl) { var dn2 = sl.closest('.donut'); dn2.setAttribute('data-hot', '1'); dn2.querySelector('.cv').textContent = sl.getAttribute('data-cv'); dn2.querySelector('.cl').textContent = sl.getAttribute('data-cl'); }
  var el = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!el) { tip.style.display = 'none'; if (hovI >= 0) { hovI = -1; hl(-1); } return; }
  tip.innerHTML = el.getAttribute('data-tip'); tip.style.display = 'block';
  var ti = el.getAttribute('data-ti'); if (ti != null && +ti !== hovI) { hovI = +ti; hl(hovI); }
});
document.addEventListener('mousemove', function (e) {
  if (tip.style.display === 'none') return;
  var x = e.clientX + 16, y = e.clientY + 16, w = tip.offsetWidth, h = tip.offsetHeight;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 16; if (y + h > window.innerHeight - 8) y = e.clientY - h - 16;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) setS({ open: null }); });
    }
    /* tabla "SKU con más movimientos" (top 10; ordenable por total, entradas, salidas o valor) */
    function movSection(S, C, opts) {
      var h = '', sel = C.sel, pv = C.pv, d1 = C.d1, all = !!(opts && opts.all);
      var sk = Object.keys(C.bySku).map(function (k) { return C.bySku[k]; });
  var srt = { total: function (a, b) { return (b.e + b.s) - (a.e + a.s); }, e: function (a, b) { return b.e - a.e; }, s: function (a, b) { return b.s - a.s; }, v: function (a, b) { return (b.ve + b.vs) - (a.ve + a.vs); } };
  sk.sort(srt[S.sort] || srt.total);
  h += '<section class="card sec" aria-label="SKU con más movimientos"><div class="sechead"><div class="l"><h2 class="tag">SKU con más movimientos</h2><span class="sub">' + (all ? nf.format(sk.length) + ' SKU · desliza para verlos todos · ' : 'Top 10 de ' + nf.format(sk.length) + ' · ') + dl(C.ps) + ' → ' + dl(d1) + ' · piezas y valor</span></div><div class="seg2" role="group" aria-label="Ordenar por">' + [['total', 'Total'], ['e', 'Entradas'], ['s', 'Salidas'], ['v', 'Valor']].map(function (o) { return '<button class="seg' + (S.sort === o[0] ? ' on' : '') + '" data-a="sort" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
  if (sk.length) h += '<div class="tw"><div class="tb" style="--cols:26px 120px minmax(0,1fr) 110px 130px 130px 100px 140px;--mw:980px"><div class="th"><div>#</div><div>SKU</div><div>Producto</div><div>Tienda</div><div class="r">Entradas</div><div class="r">Salidas</div><div class="r">Neto</div><div class="r">Valor movido</div></div>' +
    (all ? '<div class="mv-scroll" style="max-height:520px;overflow-y:auto">' : '') + sk.slice(0, all ? sk.length : 10).map(function (r, j) { var n = r.e - r.s, nvv = r.ve - r.vs;
      return '<div class="tr" style="animation-delay:' + (Math.min(j, 12) * 45) + 'ms"><div class="num sub">' + (j + 1) + '</div>' + skuBtn(r.k) + '<div class="ell" title="' + esc(D.tit[r.k]) + '">' + esc(D.tit[r.k] || '—') + '</div>' + storeCell(r.st, 'pzs movidas', 'Tiendas con movimiento') +
        '<div class="r">' + two('<span class="up">' + pz(r.e) + '</span>', money(r.ve)) + '</div><div class="r">' + two('<span class="dn">' + pz(r.s) + '</span>', money(r.vs)) + '</div><div class="r">' + two('<span class="' + cls(n) + '">' + sg(n) + '</span>', sgm(nvv)) + '</div><div class="r num"><b>' + money(r.ve + r.vs) + '</b></div></div>'; }).join('') + (all ? '</div>' + (function () { var T = sk.reduce(function (a, r) { a.e += r.e; a.s += r.s; a.ve += r.ve; a.vs += r.vs; return a; }, { e: 0, s: 0, ve: 0, vs: 0 }), n = T.e - T.s;
      return '<div class="tr mv-total" style="background:#EEF1F5;font-weight:700;border-bottom:0"><div></div><div>Total</div><div class="ell">' + nf.format(sk.length) + ' SKU</div><div></div><div class="r">' + two('<span class="up">' + pz(T.e) + '</span>', money(T.ve)) + '</div><div class="r">' + two('<span class="dn">' + pz(T.s) + '</span>', money(T.vs)) + '</div><div class="r">' + two('<span class="' + cls(n) + '">' + sg(n) + '</span>', sgm(T.ve - T.vs)) + '</div><div class="r num"><b>' + money(T.ve + T.vs) + '</b></div></div>'; })() : '') + '</div></div>';
  else h += '<div class="empty">Sin movimientos para los filtros y fechas seleccionados' + (sel.length === 1 && pv < 0 ? ' (no hay corte anterior)' : '') + '.</div>';
  h += '</section>';

      return h;
    }
    /* advertencia "SKU con baja rotación": indicadores, rangos de días sin movimiento y tabla top 15 */
    function lowRotSection(S, C, LR) {
      var h = '', d1 = C.d1, lst = LR.list, nZ = LR.nZ, nL = LR.nL, vS = LR.vS;
      // tipo: 'zero' = sin salidas, 'low' = baja rotación (<5 %), 'ok' = rotación normal, 'val' = valor detenido (sin salidas + baja rotación, de mayor a menor valor); sin tipo = todos los SKU con existencia
      var tp = S.lrT || 'all', base = tp === 'zero' ? lst.filter(function (r) { return r.cls === 'zero'; }) : tp === 'low' ? lst.filter(function (r) { return r.cls === 'low'; }) : tp === 'ok' ? lst.filter(function (r) { return r.cls === 'ok'; }) : tp === 'val' ? lst.filter(function (r) { return r.cls !== 'ok'; }) : lst, bkc = [0, 0, 0, 0];
      base.forEach(function (r) { bkc[r.b]++; });
  var bk = bkc, spanD = LR.spanD, defs = [['all', 'Todos', base.length, '#1A1A1A', '#FFFFFF'], ['0', 'Se movió hace 7 días o menos', bk[0], '#8A5A00', '#FFF7E0'], ['1', 'Hace 8 a 14 días', bk[1], '#A3520C', '#FFEBD6'], ['2', 'Sin moverse hace más de 14 días', bk[2], '#A3130C', '#FDE7E5'], ['3', 'Sin cambios en todo el periodo (' + spanD + '+ días)', bk[3], '#FFFFFF', '#A3130C']];
  var shown = S.lrB === 'all' ? base : base.filter(function (r) { return String(r.b) === S.lrB; });
  if (tp === 'val') shown = shown.slice().sort(function (a, b) { return b.v - a.v; });
  h += '<section class="card warn" aria-label="Advertencia baja rotación"><div class="warnhead"><div style="display:flex;gap:12px;align-items:flex-start"><svg width="26" height="26" viewBox="0 0 24 24" role="img" aria-label="Advertencia" style="flex:0 0 auto"><path d="M12 3 2 20h20L12 3z" fill="#E8590C"/><path d="M12 10v4.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.2" fill="#fff"/></svg><div><h2 style="margin:0;font-family:Outfit,sans-serif;font-size:17px;font-weight:600;color:#8A3A07">Advertencia · SKU con baja rotación</h2><div class="sub" style="color:#6B4A2E">SKU con existencia al ' + dl(d1) + ' clasificados por sus salidas (sin salidas, baja rotación <5% o rotación normal) entre ' + dl(C.ps) + ' y ' + dl(d1) + ' · ordenados por ' + (tp === 'val' ? 'valor detenido' : 'días sin movimiento') + ' (top 15)</div></div></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px"><button type="button" class="stat' + (tp === 'zero' ? ' on' : '') + '" data-a="lrt" data-v="zero" aria-pressed="' + (tp === 'zero') + '" title="Mostrar solo los SKU sin salidas"><b>Sin salidas</b><span class="big" style="font-size:18px">' + nf.format(nZ) + '</span></button><button type="button" class="stat' + (tp === 'low' ? ' on' : '') + '" data-a="lrt" data-v="low" aria-pressed="' + (tp === 'low') + '" title="Mostrar solo los SKU con salidas menores al 5% de su existencia"><b>Baja rotación (&lt;5%)</b><span class="big" style="font-size:18px">' + nf.format(nL) + '</span></button><button type="button" class="stat' + (tp === 'ok' ? ' on' : '') + '" data-a="lrt" data-v="ok" aria-pressed="' + (tp === 'ok') + '" title="Mostrar solo los SKU con rotación normal (salidas de 5% o más de su existencia)"><b>Rotación normal</b><span class="big" style="font-size:18px">' + nf.format(LR.nO) + '</span></button><button type="button" class="stat' + (tp === 'val' ? ' on' : '') + '" data-a="lrt" data-v="val" aria-pressed="' + (tp === 'val') + '" title="Mostrar los SKU detenidos ordenados por valor"><b>Valor detenido</b><span class="big" style="font-size:18px">' + money(vS) + '</span></button></div></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;border-top:1px solid #F3E3D0;border-bottom:1px solid #F3E3D0"><span style="font-size:12px;font-weight:600;color:#6B4A2E">Días desde el último movimiento:</span>' + defs.map(function (b) { return '<button class="bk' + (S.lrB === b[0] ? ' on' : '') + '" data-a="lrb" data-v="' + b[0] + '" style="background:' + b[4] + ';color:' + b[3] + '"><b>' + b[1] + '</b><span class="big" style="font-size:14px">' + nf.format(b[2]) + '</span></button>'; }).join('') + '</div>' +
    '<div style="padding:8px 20px 12px"><div class="tw" style="margin:0 -20px"><div class="tb" style="--cols:26px 120px minmax(0,1fr) 110px 120px 140px 90px 80px 100px 150px;--mw:1180px"><div class="th"><div>#</div><div>SKU</div><div>Producto</div><div>Tienda</div><div class="r">Existencia</div><div class="r">Valor a costo</div><div class="r">Salidas</div><div class="r">Rotación</div><div class="c">Días sin mov.</div><div>Estado</div></div>' +
    shown.slice(0, 15).map(function (r, j) {
      var red = r.never || r.days > 14, lo2 = C.lastOut[r.k];
      return '<div class="tr" style="border-bottom-color:#F3E3D0;animation-delay:' + (j * 40) + 'ms"><div class="num sub">' + (j + 1) + '</div>' + skuBtn(r.k) + '<div class="ell" title="' + esc(D.tit[r.k]) + '">' + esc(D.tit[r.k] || '—') + '</div>' + storeCell(r.st, 'pzs', 'Existencia por tienda') +
        '<div class="r num">' + pz(r.q) + ' pzs</div><div class="r num"><b>' + money(r.v) + '</b></div><div class="r num">' + pz(r.s) + '</div><div class="r num">' + r.rot.toFixed(2) + '%</div>' +
        '<div class="c"><span class="badge num" style="color:' + (red ? '#fff' : r.days > 7 ? '#A3520C' : '#8A5A00') + ';background:' + (red ? '#A3130C' : r.days > 7 ? '#FFEBD6' : '#FFF7E0') + '">' + (r.never ? r.days + '+' : r.days) + ' días</span></div>' +
        '<div><span class="badge" style="font-size:11px;color:' + (r.cls === 'zero' ? '#A3130C' : r.cls === 'low' ? '#8A5A00' : '#0B7A6E') + ';background:' + (r.cls === 'zero' ? '#FDE7E5' : r.cls === 'low' ? '#FFF1D6' : '#E3F5F2') + '">' + (r.cls === 'zero' ? (lo2 != null ? 'Sin salidas desde ' + dl(lo2) : 'Sin salidas') : r.cls === 'low' ? 'Baja rotación' : 'Rotación normal') + '</span></div></div>'; }).join('') + '</div></div>' +
    (shown.length ? '' : '<div class="empty">Sin SKU para los filtros seleccionados.</div>') + '</div></section>';

      return h;
    }
    /* composición: barra al 100 % por valor con leyenda (piezas, valor y %); lo negativo se muestra en la leyenda sin dibujarse */
    function compBar(items, note, base) {
      var tot = items.reduce(function (a, x) { return a + Math.max(0, x.v); }, 0), s = '<div class="comp"><div class="compbar" role="img" aria-label="Composición del inventario por valor">';
      items.forEach(function (x, j) {
        var w = tot && x.v > 0 ? x.v / tot * 100 : 0; if (w <= 0) return;
        var t = '<div class="h">' + esc(x.name) + '</div><div class="l"><span>Piezas</span><b>' + pz(x.q) + '</b></div><div class="l"><span>Valor a costo</span><b>' + money(x.v) + '</b></div><div class="sp">' + w.toFixed(2) + '% del valor</div>';
        s += '<div class="seg3" style="width:' + w.toFixed(3) + '%;background:' + x.color + ';animation-delay:' + (j * 120) + 'ms"' + tipAttr(t) + '></div>';
      });
      s += '</div><div class="complg">' + items.map(function (x) {
        var pc = (base || tot) ? x.v / (base || tot) * 100 : 0;
        return '<div class="cl"><span class="swt" style="background:' + x.color + '"></span><div><b>' + esc(x.name) + '</b><div class="num">' + pz(x.q) + ' pzs · ' + money(x.v) + ' · ' + pc.toFixed(2) + '%</div>' + (x.note ? '<div class="sub">' + esc(x.note) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>' + (note ? '<div class="sub" style="margin-top:6px">' + note + '</div>' : '') + '</div>';
      return s;
    }
    /* recuadros de la tendencia: fecha, piezas, valor y cambio contra el corte seleccionado anterior */
    function trendTips(C) {
      var sel = C.sel, invU = C.invU, invV = C.invV;
      return sel.map(function (k, j) {
        var pk = j > 0 ? sel[j - 1] : null, t = '<div class="h">' + dl(k) + ' ' + D.dates[k].slice(0, 4) + ' · ' + dow(k) + '</div><div class="l"><span>Piezas</span><b>' + pz(invU[k]) + '</b></div><div class="l"><span>Valor a costo</span><b>' + money(invV[k]) + '</b></div>';
        if (pk != null) { var a = invU[k] - invU[pk], b = invV[k] - invV[pk]; t += '<div class="sp">vs ' + dl(pk) + '</div><div class="l"><span style="color:' + (a > 0 ? '#7FD3C8' : a < 0 ? '#FFB08A' : '#CFCFCF') + '">' + arrow(a) + ' ' + sg(a) + ' pzs</span><span style="color:' + (b > 0 ? '#7FD3C8' : b < 0 ? '#FFB08A' : '#CFCFCF') + '">' + sgm(b) + '</span></div>'; }
        return t;
      });
    }
    var STATUS_COL = { 'Aptas para vender': '#0E9F8E', 'Pendientes de ingreso': '#2A4E8C', 'En transferencia': '#4D9BD6', 'En revisión': '#B8862B', 'No aptas para vender': '#E10600', 'Devueltas por el comprador': '#6A5BB0', 'Extraviadas (en búsqueda)': '#A3ADB8' };
    function statusColor(name, k) { return STATUS_COL[name] || PAL[k % PAL.length]; }

    function header(o) {
      var opts_showPlat = o.showPlat !== false;
      var S = o.S, C = o.C, sel = C.sel, d1 = C.d1, iDisp = o.iDisp, iRes = o.iRes, h = '', i;
      function ms(id, label, opts, selArr, searchable, right) { return multisel(id, label, opts, selArr, searchable, right, S.open); }
  var dsum = sel.length === ND ? 'Todas · ' + dl(0) + ' – ' + dl(ND - 1) : sel.length <= 3 ? sel.map(dl).join(', ') : sel.length + ' fechas · ' + dl(sel[0]) + ' – ' + dl(d1);
  h += '<div class="wrap"><header class="top card" style="border:0;box-shadow:none;border-bottom:4px solid var(--red);background:#000;border-radius:4px"><div class="brand"><img src="assets/logo_selectshop.png" alt="selectshop"><div class="vsep"></div><div><h1>' + esc(o.title) + '</h1><div class="st">' + esc(o.sub) + ' · cortes del ' + dl(0) + ' al ' + dl(ND - 1) + ' ' + D.dates[ND - 1].slice(0, 4) + ' · piezas y valor a costo</div></div></div>' +
    '<div class="fg"><div class="lbl" id="l-d">Fechas de corte</div><button type="button" class="fld" style="background:#1A1A1A;color:#fff;border:1.5px solid var(--red);height:38px;min-width:240px;font-weight:600" data-a="open" data-v="d" aria-haspopup="true" aria-expanded="' + (S.open === 'd') + '" aria-labelledby="l-d"><span class="num">' + esc(dsum) + '</span><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>';
  if (S.open === 'd') {
    h += '<div class="backdrop" data-a="close"></div><div class="pop r" role="group" aria-label="Fechas de corte"><div class="bar1"><button class="lnk" data-a="dpre" data-v="all">Todas</button><button class="lnk m" data-a="dpre" data-v="two">Últimas 2</button><button class="lnk m" data-a="dpre" data-v="last">Solo última</button></div><div class="list">' +
      D.dates.map(function (x, k) { return '<label class="opt"><input type="checkbox" data-a="chk" data-g="d" data-v="' + k + '"' + (inSet(sel, k) ? ' checked' : '') + '><span class="num" style="flex:1">' + dl(k) + ' ' + x.slice(0, 4) + '</span><span class="sub">' + dow(k) + '</span></label>'; }).join('') +
      '</div><div class="foot"><span>' + sel.length + ' de ' + ND + ' cortes</span><button class="ok" data-a="close">Aplicar</button></div></div>';
  }
  h += '</div><div class="filters">' +
    '<div class="fg"><div class="lbl">Fuente</div><div class="segs" role="group" aria-label="Fuente">' + [['all', 'Todos'], ['erp', 'ERP'], ['plat', 'Plataformas']].filter(function (o) { return o[0] !== 'plat' || opts_showPlat || S.mode === 'plat'; }).map(function (o) { return '<button class="seg' + (S.mode === o[0] ? ' on' : '') + '" data-a="mode" data-v="' + o[0] + '" aria-pressed="' + (S.mode === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
  if (S.mode === 'erp' && o.showEt !== false) {
    h += '<div class="fg"><div class="lbl">Inventario ERP</div><div class="segs" role="group" aria-label="Tipo de inventario ERP">' +
      [['t', 'Total', 0], ['d', 'Disponible para la venta', iDisp], ['r', 'Reservado', iRes]].map(function (o) { var av = o[2] >= 0; return '<button class="seg' + (S.et === o[0] && av ? ' on2' : '') + '" data-a="et" data-v="' + o[0] + '"' + (av ? '' : ' disabled title="Sin datos de disponible/reservado"') + '>' + o[1] + '</button>'; }).join('') + '</div></div>';
  }
  if (S.mode === 'plat' && o.showPlatList !== false) {
    h += '<div class="fg"><div class="lbl">Plataforma</div><div class="segs" role="group" aria-label="Plataforma">' +
      [['all', 'Todas'], ['AMAZON', 'Amazon'], ['MERCADO LIBRE', 'Mercado Libre'], ['COPPEL', 'Coppel'], ['LIVERPOOL', 'Liverpool'], ['WALMART', 'Walmart']].map(function (o) {
        var ix = o[0] === 'all' ? -1 : D.dims.ch.indexOf(o[0]); if (o[0] !== 'all' && ix < 0) return '';
        return '<button class="seg' + (S.ch === ix ? ' on2' : '') + '" data-a="ch" data-v="' + ix + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
  }
  h += ms('t', 'Tienda', C.tAll, S.ts) + (o.showCat === false ? '' : ms('c', 'Categoría / Clasificación', C.cAll, S.cs, true)) +
    (o.showUb ? ms('u', S.mode === 'plat' ? 'Ubicación (estatus)' : 'Ubicación', C.uAll, S.us) : '') +
    '<div class="fg" style="flex:1 1 150px"><label class="lbl" for="f-q">Buscar SKU</label><input id="f-q" class="fld" type="search" placeholder="SKU o producto" value="' + esc(S.q) + '"></div>' +
    '<button type="button" class="clear" data-a="clear">Limpiar</button></div></header>';

  var chips = [];
  if (S.ch >= 0 && S.mode !== 'plat') chips.push(['Almacén: ' + D.dims.ch[S.ch], 'ch']);
  if (S.mode === 'plat' && S.ch >= 0) chips.push(['Plataforma: ' + D.dims.ch[S.ch], 'ch']);
  if (S.q.trim()) chips.push(['SKU: ' + S.q.trim(), 'q']);
  if (S.us.length) chips.push([(S.mode === 'plat' ? 'Estatus: ' : 'Ubicación: ') + S.us.map(function (k) { return D.dims.u[k]; }).join(', '), 'us']);
  if (chips.length) h += '<div class="chips">' + chips.map(function (c) { return '<button class="chip" data-a="chip" data-v="' + c[1] + '">' + esc(c[0]) + ' <b>×</b></button>'; }).join('') + '<span class="sub">La búsqueda de SKU filtra movimientos y tablas; el inventario y la tendencia usan los filtros de dimensión.</span></div>';
      return h;
    }
    return { trendTips: trendTips, compBar: compBar, statusColor: statusColor, movSection: movSection, lowRotSection: lowRotSection, header: header, wire: wire, nf: nf, mf: mf, esc: esc, pz: pz, money: money, money0: money0, sg: sg, sgm: sgm, pcs: pcs, arrow: arrow, cls: cls, dl: dl, dow: dow,
             tipAttr: tipAttr, storeCell: storeCell, skuBtn: skuBtn, two: two, niceStep: niceStep, comboChart: comboChart, PAL: PAL, OTH: OTH,
             rankMap: rankMap, donutSvg: donutSvg, donutSection: donutSection, multisel: multisel, barlist: barlist };
  }
  g.Kit = { create: create };
})(window);
