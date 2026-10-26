/*
 * engine.js — motor de cálculo del dashboard de inventario (sin DOM).
 *
 * Lee window.DASHBOARD_DATA (generado por scripts/generar_datos.py) y calcula, para un estado de filtros S,
 * todo lo que muestran las vistas: existencias por corte, clasificación vendible / no vendible, canales,
 * almacenes y ubicaciones, movimientos entre cortes, SKU nuevos, baja rotación y alertas.
 * Lo usan index.html, index_horizontal.html e index_ejecutivo.html; la interfaz solo dibuja lo que este módulo devuelve.
 *
 * Formato de datos:
 *   st  = [src, ch, t, c, u, di, q, v]            existencias agregadas por corte
 *   mv  = [src, ch, t, c, u, sku, di, dq, dv]      movimientos entre cortes consecutivos
 *   inv2= [src, ch, t, c, u, sku, costoUnit, q...] existencias por SKU en cada corte
 *   src: 0 = ERP, 1 = PLATAFORMAS, luego "ERP · Disponible" y "ERP · Reservado" si hay archivo de disponible.
 */
(function (g) {
  'use strict';

  function create(D) {
    var ND = D.dates.length, iDisp = D.dims.src.indexOf('ERP · Disponible'), iRes = D.dims.src.indexOf('ERP · Reservado'), iMer = D.dims.src.indexOf('ERP · Mermas'), iVp = D.dims.src.indexOf('ERP · Venta plataforma'), iOut = D.dims.src.indexOf('ERP · Venta Outlet'), iFuera = D.dims.src.indexOf('PLATAFORMAS · Fuera del inventario');
    var cache = {}, skuRowsCache = {};
    /* filtros de varias opciones: acepta un índice, una lista de índices, -1 o null (sin filtro) y devuelve un conjunto o null */
    function setOf(v) { if (v == null || v === -1) return null; var a = Array.isArray(v) ? v : [v], o = {}; if (!a.length) return null; a.forEach(function (x) { o[x] = 1; }); return o; }
    D.low = D.skus.map(function (s, i) { return (s + ' ' + D.tit[i]).toLowerCase(); });
    var vendNames = (D.cfg && D.cfg.vendible_estatus_plataformas) || ['Aptas para vender'];
    var vendSet = {}; D.dims.u.forEach(function (n, i) { if (vendNames.indexOf(n) >= 0) vendSet[i] = 1; });
    var chPlat = {}; // índice de ch -> nombre, solo canales que existen en Plataformas
    D.st.forEach(function (r) { if (r[0] === 1) chPlat[r[1]] = D.dims.ch[r[1]]; });

    /* Con búsqueda de SKU todo se recalcula desde la existencia por SKU (inv2), con el mismo formato de fila que st */
    function skuRows(q, skuOk) {
      if (skuRowsCache[q]) return skuRowsCache[q];
      var out = [];
      D.inv2.forEach(function (r) {
        if (!skuOk[r[5]]) return;
        for (var di = 0; di < ND; di++) { var qd = r[7 + di]; if (qd) out.push([r[0], r[1], r[2], r[3], r[4], di, qd, qd * r[6]]); }
      });
      return skuRowsCache[q] = out;
    }

    function erpBase(S) { return S.mode === 'erp' ? (S.et === 'd' && iDisp >= 0 ? iDisp : S.et === 'r' && iRes >= 0 ? iRes : 0) : 0; }
    function srcFilter(S) { return S.mode === 'all' ? -1 : S.mode === 'plat' ? 1 : erpBase(S); }
    function inSet(arr, v) { return arr.indexOf(v) >= 0; }

    /* opciones de los filtros (canal/almacén, tienda, categoría, ubicación/estatus) disponibles para una fuente */
    function options(sf) {
      var key = 'o' + sf; if (cache[key]) return cache[key];
      var sets = [{}, {}, {}, {}];
      D.st.forEach(function (r) { if (sf < 0 ? r[0] <= 1 : r[0] === sf) { sets[0][r[1]] = 1; sets[1][r[2]] = 1; sets[2][r[3]] = 1; sets[3][r[4]] = 1; } });
      var nm = ['ch', 't', 'c', 'u'];
      return cache[key] = sets.map(function (s, k) {
        return Object.keys(s).map(Number).sort(function (a, b) { return D.dims[nm[k]][a].localeCompare(D.dims[nm[k]][b], 'es'); }).map(function (i) { return { v: i, label: D.dims[nm[k]][i] }; });
      });
    }

    function compute(S) {
      var sf = srcFilter(S), opt = options(sf), C = {}, i;
      var tAll = opt[1], cAll = opt[2], uAll = opt[3];
      var tUse = S.ts.length > 0 && S.ts.length < tAll.length, cUse = S.cs.length > 0 && S.cs.length < cAll.length, uUse = S.us.length > 0 && S.us.length < uAll.length;
      var tS = {}, cS = {}, uS = {}; S.ts.forEach(function (v) { tS[v] = 1; }); S.cs.forEach(function (v) { cS[v] = 1; }); S.us.forEach(function (v) { uS[v] = 1; });
      function dimOk(r) { return !((S.ch >= 0 && r[1] !== S.ch) || (tUse && !tS[r[2]]) || (cUse && !cS[r[3]]) || (uUse && !uS[r[4]])); }
      function srcOk(r) { return sf < 0 ? r[0] <= 1 : r[0] === sf; }
      var q = S.q.trim().toLowerCase(), skuOk = null;
      if (q) { skuOk = new Uint8Array(D.skus.length); for (i = 0; i < D.low.length; i++) if (D.low[i].indexOf(q) >= 0) skuOk[i] = 1; }

      var sel = S.ds.slice().sort(function (a, b) { return a - b; }); if (!sel.length) sel = D.dates.map(function (x, k) { return k; });
      var d0 = sel[0], d1 = sel[sel.length - 1];
      function prevOf(k) { var p = sel.indexOf(k); return p > 0 ? sel[p - 1] : k - 1; }
      var pv = prevOf(d1);
      if (D.has && D.has[sf] && D.has[sf].indexOf(pv) < 0) pv = -1;
      var ps = sel.length > 1 ? d0 : (pv >= 0 ? pv : d0);       // inicio del periodo de movimientos
      var eb = S.mode === 'erp' ? erpBase(S) : 0;
      Object.assign(C, { sf: sf, eb: eb, opt: opt, tAll: tAll, cAll: cAll, uAll: uAll, sel: sel, d0: d0, d1: d1, pv: pv, ps: ps, prevOf: prevOf, tUse: tUse, cUse: cUse, uUse: uUse, tS: tS, cS: cS, skuOk: skuOk, q: q });

      /* existencias por corte (con filtros), por fuente, desgloses al último corte y clasificación de venta */
      var invU = new Array(ND).fill(0), invV = new Array(ND).fill(0), A = {}, byUb = {}, byAl = {}, byEs = {}, byCat = {}, byCatT = {}, matAU = {}, matATU = {}, canal = {};
      var platV = [], platN = [], catIni = {}, catFin = {};   // categoría -> [ERP, Plataformas] al inicio / final del periodo
      for (i = 0; i < ND; i++) { platV.push({ q: 0, v: 0 }); platN.push({ q: 0, v: 0 }); }
      function add(o, k, r) { var x = o[k] || (o[k] = { q: 0, v: 0 }); x.q += r[6]; x.v += r[7]; return x; }
      (skuOk ? skuRows(q, skuOk) : D.st).forEach(function (r) {
        if (!dimOk(r)) return;
        var a = A[r[0]] || (A[r[0]] = {}), x = a[r[5]] || (a[r[5]] = { q: 0, v: 0 }); x.q += r[6]; x.v += r[7];
        if (srcOk(r)) { invU[r[5]] += r[6]; invV[r[5]] += r[7]; }
        if (srcOk(r) && (r[5] === d1 || r[5] === ps)) { var cc = r[5] === d1 ? catFin : catIni, ci = cc[r[3]] || (cc[r[3]] = [{ q: 0, v: 0 }, { q: 0, v: 0 }]), cs = ci[r[0] === 1 ? 1 : 0]; cs.q += r[6]; cs.v += r[7]; }
        if (r[0] === 1) { var c1 = vendSet[r[4]] ? platV[r[5]] : platN[r[5]]; c1.q += r[6]; c1.v += r[7]; }
        var isErp = r[0] === eb && S.mode !== 'plat', isPlat = r[0] === 1 && S.mode !== 'erp';
        if (r[5] !== d1 && r[5] !== pv) return;
        // canal: ERP (almacenes) y cada plataforma; "p" = corte anterior
        if (isErp || isPlat) {
          var key = isErp ? 'ERP' : D.dims.ch[r[1]];
          var cn = canal[key] || (canal[key] = { key: key, erp: isErp, q: 0, v: 0, qp: 0, vp: 0, byU: {}, vq: 0, vv: 0 });
          if (r[5] === d1) { cn.q += r[6]; cn.v += r[7]; var bu = cn.byU[r[4]] || (cn.byU[r[4]] = { q: 0, v: 0 }); bu.q += r[6]; bu.v += r[7]; if (isPlat && vendSet[r[4]]) { cn.vq += r[6]; cn.vv += r[7]; } }
          else { cn.qp += r[6]; cn.vp += r[7]; }
        }
        if (r[5] !== d1) return;
        if (srcOk(r)) { add(byCat, r[3], r); add(byCatT[r[3]] || (byCatT[r[3]] = {}), r[2], r); }
        if (isErp) { add(byUb, r[4], r); add(byAl, r[1], r); var m = matAU[r[1]] || (matAU[r[1]] = {}); add(m, r[4], r); var mk = r[1] + '|' + r[2], mt = matATU[mk] || (matATU[mk] = { ch: r[1], t: r[2], u: {} }); add(mt.u, r[4], r); }
        if (isPlat) add(byEs, r[4], r);
      });
      function A_(s, di) { return (A[s] && A[s][di]) || { q: 0, v: 0 }; }
      Object.assign(C, { invU: invU, invV: invV, A: A_, byUb: byUb, byAl: byAl, byEs: byEs, byCat: byCat, catIni: catIni, catFin: catFin, byCatT: byCatT, matAU: matAU, matATU: matATU, canal: canal, platV: platV, platN: platN });

      /* movimientos */
      var dE = new Array(ND).fill(0), dS = dE.slice(), dVE = dE.slice(), dVS = dE.slice(), dK = [], lastMv = {}, lastOut = {}, bySku = {}, byCatMov = {}, byCatMovT = {}, byCatMovS = {}, byCatMovTS = [{}, {}], pares = {}, dsk = [{}, {}];
      for (i = 0; i < ND; i++) dK.push({});
      D.mv.forEach(function (r) {
        if (!srcOk(r) || !dimOk(r) || (skuOk && !skuOk[r[5]])) return;
        var di = r[6], dq = r[7], dv = r[8];
        if (dq > 0) { dE[di] += dq; dVE[di] += dv; } else { dS[di] -= dq; dVS[di] -= dv; }
        dK[di][r[5]] = 1;
        if (di <= d1) { if (!(lastMv[r[5]] >= di)) lastMv[r[5]] = di; if (dq < 0 && !(lastOut[r[5]] >= di)) lastOut[r[5]] = di; }
        if (di <= ps || di > d1) return;
        var cm = byCatMov[r[3]] || (byCatMov[r[3]] = { k: r[3], e: 0, s: 0, ve: 0, vs: 0 });
        if (dq > 0) { cm.e += dq; cm.ve += dv; } else { cm.s -= dq; cm.vs -= dv; }
        if (pv >= 0 && di > pv) { var sk0 = dsk[r[0] === 1 ? 1 : 0][r[5]] || (dsk[r[0] === 1 ? 1 : 0][r[5]] = { e: 0, s: 0, ve: 0, vs: 0 }); if (dq > 0) { sk0.e += dq; sk0.ve += dv; } else { sk0.s -= dq; sk0.vs -= dv; } }
        var cms = (byCatMovS[r[3]] || (byCatMovS[r[3]] = [{ e: 0, s: 0, ve: 0, vs: 0, iq: 0, ive: 0, ivs: 0 }, { e: 0, s: 0, ve: 0, vs: 0, iq: 0, ive: 0, ivs: 0 }]))[r[0] === 1 ? 1 : 0];   // 0 = ERP, 1 = Plataformas
        if (dq > 0) { cms.e += dq; cms.ve += dv; } else { cms.s -= dq; cms.vs -= dv; }
        var gk = (r[0] === 1 ? 1 : 0) + '|' + r[3] + '|' + r[2] + '|' + r[5] + '|' + di, gi = pares[gk] || (pares[gk] = { c: r[3], s: r[0] === 1 ? 1 : 0, iq: 0, iv: 0, oq: 0, ov: 0 });
        if (dq > 0) { gi.iq += dq; gi.iv += dv; } else { gi.oq -= dq; gi.ov -= dv; }
        var cmts = ((byCatMovTS[r[0] === 1 ? 1 : 0][r[3]] || (byCatMovTS[r[0] === 1 ? 1 : 0][r[3]] = {}))[r[2]]) || (byCatMovTS[r[0] === 1 ? 1 : 0][r[3]][r[2]] = { e: 0, s: 0, ve: 0, vs: 0 });
        if (dq > 0) { cmts.e += dq; cmts.ve += dv; } else { cmts.s -= dq; cmts.vs -= dv; }
        var cmt = (byCatMovT[r[3]] || (byCatMovT[r[3]] = {}))[r[2]] || (byCatMovT[r[3]][r[2]] = { e: 0, s: 0, ve: 0, vs: 0 });
        if (dq > 0) { cmt.e += dq; cmt.ve += dv; } else { cmt.s -= dq; cmt.vs -= dv; }
        var k = bySku[r[5]] || (bySku[r[5]] = { k: r[5], e: 0, s: 0, ve: 0, vs: 0, st: {} });
        k.st[r[2]] = (k.st[r[2]] || 0) + Math.abs(dq);
        if (dq > 0) { k.e += dq; k.ve += dv; } else { k.s -= dq; k.vs -= dv; }
      });
      Object.keys(pares).forEach(function (k) {
        var g = pares[k], m = Math.min(g.iq, g.oq); if (m <= 0) return;
        var o = byCatMovS[g.c][g.s]; o.iq += m; o.ive += m * (g.iv / g.iq); o.ivs += m * (g.ov / g.oq);
      });
      function span(a, b) { var o = { e: 0, s: 0, ve: 0, vs: 0, k: {} }; for (var z = a + 1; z <= b; z++) { if (z < 0) continue; o.e += dE[z]; o.s += dS[z]; o.ve += dVE[z]; o.vs += dVS[z]; for (var kk in dK[z]) o.k[kk] = 1; } o.n = Object.keys(o.k).length; return o; }
      C.span = span; C.byCatMov = byCatMov; C.byCatMovT = byCatMovT; C.byCatMovS = byCatMovS; C.byCatMovTS = byCatMovTS; C.bySku = bySku; C.lastMv = lastMv; C.lastOut = lastOut;
      C.per = span(ps, d1);
      // movimientos entre cada par de cortes seleccionados consecutivos
      C.periods = [];
      for (i = 1; i < sel.length; i++) { var sp = span(sel[i - 1], sel[i]); C.periods.push({ from: sel[i - 1], to: sel[i], e: sp.e, s: sp.s, ve: sp.ve, vs: sp.vs, n: sp.n }); }
      if (sel.length === 1 && pv >= 0) { var s1 = span(pv, d1); C.periods.push({ from: pv, to: d1, e: s1.e, s: s1.s, ve: s1.ve, vs: s1.vs, n: s1.n }); }

      /* SKU nuevos, baja rotación y top productos por canal (existencia por llave completa, con todos los filtros) */
      var ns = {}, nsG = [{}, {}], ag = {}, tops = {}, QI = 7;
      D.inv2.forEach(function (r) {
        if (!srcOk(r) || !dimOk(r) || (skuOk && !skuOk[r[5]])) return;
        var cu = r[6], qd = r[QI + d1];
        if (pv >= 0) {
          var o = ns[r[5]] || (ns[r[5]] = { p: 0, c: 0, v: 0, st: {} }); o.p += r[QI + pv]; o.c += qd; o.v += qd * cu;
          if (qd > 0) o.st[r[2]] = (o.st[r[2]] || 0) + qd;
          var og = nsG[r[0] === 1 ? 1 : 0], o2 = og[r[5]] || (og[r[5]] = { p: 0, c: 0, v: 0, pvv: 0, st: {} }); o2.p += r[QI + pv]; o2.c += qd; o2.v += qd * cu; o2.pvv += r[QI + pv] * cu;
          if (qd > 0) o2.st[r[2]] = (o2.st[r[2]] || 0) + qd;
        }
        if (qd > 0) {
          var a = ag[r[5]] || (ag[r[5]] = { q: 0, v: 0, st: {} }); a.q += qd; a.v += qd * cu; a.st[r[2]] = (a.st[r[2]] || 0) + qd;
          var key = r[0] === 1 ? D.dims.ch[r[1]] : 'ERP', tp = tops[key] || (tops[key] = {}), t1 = tp[r[5]] || (tp[r[5]] = { k: r[5], q: 0, v: 0, st: {} });
          t1.q += qd; t1.v += qd * cu; t1.st[r[2]] = (t1.st[r[2]] || 0) + qd;
        }
      });
      function nuevos(o) { return Object.keys(o).map(Number).filter(function (k) { return o[k].p <= 0 && o[k].c > 0; }).map(function (k) { return { k: k, q: o[k].c, v: o[k].v, st: o[k].st }; }).sort(function (a, b) { return b.v - a.v; }); }
      C.news = nuevos(ns); C.newsErp = nuevos(nsG[0]); C.newsPlat = nuevos(nsG[1]);
      C.ag = ag; C.tops = tops;
      /* puente del inventario contra el corte anterior, por fuente: inicio + SKU nuevos + entradas y salidas de SKU que ya existían = final */
      C.bridge = [null, null];
      if (pv >= 0) [0, 1].forEach(function (g) {
        var set = {}; (g === 0 ? C.newsErp : C.newsPlat).forEach(function (x) { set[x.k] = 1; });
        var a0 = C.A(g === 1 ? 1 : eb, pv), a1 = C.A(g === 1 ? 1 : eb, d1);
        var b = { ini: { q: a0.q, v: a0.v }, fin: { q: a1.q, v: a1.v }, nuevos: { n: Object.keys(set).length, q: 0, v: 0 }, ent: { q: 0, v: 0 }, sal: { q: 0, v: 0 }, agot: { n: 0, q: 0, v: 0 } };
        Object.keys(dsk[g]).forEach(function (k) { var x = dsk[g][k]; if (set[k]) { b.nuevos.q += x.e - x.s; b.nuevos.v += x.ve - x.vs; } else { b.ent.q += x.e; b.ent.v += x.ve; b.sal.q += x.s; b.sal.v += x.vs; } });
        Object.keys(nsG[g]).forEach(function (k) { var x = nsG[g][k]; if (x.p > 0 && x.c <= 0) { b.agot.n++; b.agot.q += x.p; b.agot.v += x.pvv; } });
        C.bridge[g] = b;
      });
      return C;
    }

    /* mayores productos por valor de un canal ('ERP' o nombre de plataforma) */
    function topProducts(C, key, n) {
      var o = C.tops[key] || {};
      return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.v - a.v; }).slice(0, n || 10);
    }

    /* Resumen ejecutivo: total, vendible / no vendible y variación contra el corte anterior.
       Vendible = Plataformas "Aptas para vender" + ERP "Disponible para la venta" (solo si hay archivo en ese corte).
       Comprometido = ERP "Reservado". Diferencia ERP = ERP total − disponible − comprometido, solo de las tiendas con archivo. */
    function summary(S, C) {
      function at(di) {
        if (di < 0) return null;
        var erp = C.A(0, di), pl = C.A(1, di), dis = iDisp >= 0 ? C.A(iDisp, di) : { q: 0, v: 0 }, res = iRes >= 0 ? C.A(iRes, di) : { q: 0, v: 0 };
        var mer = iMer >= 0 ? C.A(iMer, di) : { q: 0, v: 0 }, vplat = iVp >= 0 ? C.A(iVp, di) : { q: 0, v: 0 }, outl = iOut >= 0 ? C.A(iOut, di) : { q: 0, v: 0 };
        var hasD = !!(D.has && D.has[iDisp] && D.has[iDisp].indexOf(di) >= 0);
        var useE = S.mode !== 'plat', useP = S.mode !== 'erp';
        var tot = { q: (useE ? (S.mode === 'erp' ? C.A(C.eb, di).q : erp.q) : 0) + (useP ? pl.q : 0), v: (useE ? (S.mode === 'erp' ? C.A(C.eb, di).v : erp.v) : 0) + (useP ? pl.v : 0) };
        var vend = { q: 0, v: 0 }, nov = { q: 0, v: 0 }, com = { q: 0, v: 0 };
        if (useP) { vend.q += C.platV[di].q; vend.v += C.platV[di].v; nov.q += C.platN[di].q; nov.v += C.platN[di].v; }
        if (useE && hasD && S.mode !== 'erp') { vend.q += dis.q; vend.v += dis.v; com.q += res.q; com.v += res.v; }
        if (S.mode === 'erp' && hasD) { if (C.eb === iDisp) { vend.q += dis.q; vend.v += dis.v; } else if (C.eb === iRes) { com.q += res.q; com.v += res.v; } else { vend.q += dis.q; vend.v += dis.v; com.q += res.q; com.v += res.v; } }
        var cls = { q: vend.q + nov.q + com.q, v: vend.v + nov.v + com.v };
        var venErp = { q: 0, v: 0 }, venPlat = { q: 0, v: 0 };
        if (useP) { venPlat.q = C.platV[di].q; venPlat.v = C.platV[di].v; }
        if (useE && hasD && (S.mode !== 'erp' || C.eb === 0 || C.eb === iDisp)) { venErp.q = dis.q; venErp.v = dis.v; }
        return { tot: tot, vend: vend, nov: nov, com: com, sinClas: { q: tot.q - cls.q, v: tot.v - cls.v }, hasD: hasD, mer: mer, vplat: vplat, outl: outl, erp: erp, plat: pl,
                 totErp: { q: useE ? (S.mode === 'erp' ? C.A(C.eb, di).q : erp.q) : 0, v: useE ? (S.mode === 'erp' ? C.A(C.eb, di).v : erp.v) : 0 }, totPlat: { q: useP ? pl.q : 0, v: useP ? pl.v : 0 },
                 ven: { q: venErp.q + venPlat.q, v: venErp.v + venPlat.v }, venErp: venErp, venPlat: venPlat };
      }
      return { cur: at(C.d1), prev: at(C.pv) };
    }

    /* Baja rotación: SKU con existencia al último corte y sin salidas (o < 5 % de su existencia) en el periodo */
    function lowRot(C) {
      var list = [], nZ = 0, nL = 0, nO = 0, vS = 0, vO = 0, d1 = C.d1;
      Object.keys(C.ag).forEach(function (k) {
        var o = C.ag[k], so = C.bySku[k] ? C.bySku[k].s : 0, sv = C.bySku[k] ? C.bySku[k].vs : 0, rot = so / o.q * 100;
        var cl = so === 0 ? 'zero' : rot < 5 ? 'low' : 'ok';   // sin salidas · baja rotación (< 5 %) · rotación normal
        if (cl === 'zero') nZ++; else if (cl === 'low') nL++; else nO++;
        if (cl === 'ok') vO += o.v; else vS += o.v;
        var lm = C.lastMv[k], days = Math.round((Date.parse(D.dates[d1]) - Date.parse(D.dates[lm != null ? lm : 0])) / 864e5);
        list.push({ k: +k, q: o.q, v: o.v, s: so, sv: sv, rot: rot, st: o.st, days: days, never: lm == null, zero: so === 0, cls: cl });
      });
      var bk = [0, 0, 0, 0], bv = [0, 0, 0, 0];
      list.forEach(function (r) { r.b = r.never ? 3 : r.days > 14 ? 2 : r.days > 7 ? 1 : 0; bk[r.b]++; bv[r.b] += r.v; });
      list.sort(function (a, b) { return b.days - a.days || b.v - a.v; });
      return { list: list, nZ: nZ, nL: nL, nO: nO, vS: vS, vO: vO, bk: bk, bv: bv, spanD: Math.round((Date.parse(D.dates[d1]) - Date.parse(D.dates[0])) / 864e5) };
    }

    /* Inventario sin movimiento: todo SKU con existencia al último corte, por días desde su último cambio de existencias
       (0-7, 8-14, más de 14 y sin cambios en todo el periodo con datos). */
    function noMov(C) {
      var b = [0, 1, 2, 3].map(function () { return { n: 0, q: 0, v: 0 }; }), tot = { n: 0, q: 0, v: 0 };
      Object.keys(C.ag).forEach(function (k) {
        var o = C.ag[k], lm = C.lastMv[k], never = lm == null, days = Math.round((Date.parse(D.dates[C.d1]) - Date.parse(D.dates[never ? 0 : lm])) / 864e5);
        var x = b[never ? 3 : days > 14 ? 2 : days > 7 ? 1 : 0]; x.n++; x.q += o.q; x.v += o.v; tot.n++; tot.q += o.q; tot.v += o.v;
      });
      return { b: b, tot: tot };
    }

    /* ---------- Concentración de valor: total de referencia → almacén / canal → categoría → SKU ----------
       Valor oficial = suma de st (concentrados). Valor por SKU = cantidad × costo unitario (inv2). Los dos se concilian, no se forzan.
       Universo: ERP + Plataformas (aptas y no aptas), igual que el Resumen ejecutivo. Disponible/Reservado/Mermas son clasificaciones del mismo stock y no se suman. */
    /* compañía de una fila: ERP por almacén, Plataformas por tienda (mapeo en cfg.companias, generado por scripts/generar_datos.py) */
    function ciaOf(r) {
      var C = (D.cfg && D.cfg.companias) || {};
      return (r[0] === 0 ? (C.almacen || {})[D.dims.ch[r[1]]] : (C.tienda_plataformas || {})[D.dims.t[r[2]]]) || 'Sin compañía';
    }
    function valor(di, F, U) {
      F = F || {}; U = U || {}; var fu = F.fuente == null ? -1 : F.fuente, fch = setOf(F.ch), fc = F.c == null ? -1 : F.c;
      var uf = U.fuente == null ? -1 : U.fuente, ut = setOf(U.t), cias = {};
      function inU(s) { return s <= 1 || s === iFuera; }          // universo: ERP + Plataformas con todos los estatus
      function fte(s) { return s === iFuera ? 1 : s; }            // fuente: 0 = ERP, 1 = Plataformas
      function uOk(s, tienda) { return (uf < 0 || fte(s) === uf) && (ut == null || ut[tienda]); }   // filtros globales: fuente y tienda
      function selOk(s, ch) { return (fu < 0 || fte(s) === fu) && (fch == null || fch[ch]); }
      var ref = { q: 0, v: 0 }, prev = di > 0 ? { q: 0, v: 0 } : null, alm = {}, can = {}, sel = { q: 0, v: 0 }, cats = {};
      D.st.forEach(function (r) {
        if (!inU(r[0]) || !uOk(r[0], r[2])) return;
        if (r[5] === di) {
          ref.q += r[6]; ref.v += r[7];
          var g = (r[0] === 0 ? alm : can), x = g[r[1]] || (g[r[1]] = { ch: r[1], q: 0, v: 0 }); x.q += r[6]; x.v += r[7];
          if (selOk(r[0], r[1])) { sel.q += r[6]; sel.v += r[7]; var c = cats[r[3]] || (cats[r[3]] = { c: r[3], q: 0, v: 0 }); c.q += r[6]; c.v += r[7]; }
          if (selOk(r[0], r[1]) && (fc < 0 || r[3] === fc)) { var cn = ciaOf(r), cx = cias[cn] || (cias[cn] = { n: cn, q: 0, v: 0, det: {} }); cx.q += r[6]; cx.v += r[7];
            var dn = r[0] === 0 ? D.dims.ch[r[1]] : D.dims.t[r[2]], rz = r[0] === 0 ? '' : (((D.cfg && D.cfg.razones) || {})[D.dims.ch[r[1]] + '|' + D.dims.t[r[2]]] || 'Sin razón social'), dk = (r[0] === 0 ? 0 : 1) + '|' + dn + '|' + (r[0] === 0 ? r[2] : rz), dx = cx.det[dk] || (cx.det[dk] = { fuente: r[0] === 0 ? 'ERP' : 'Plataformas', nombre: dn, tienda: r[0] === 0 ? D.dims.t[r[2]] : '', razon: rz, q: 0, v: 0 }); dx.q += r[6]; dx.v += r[7]; }
        } else if (prev && r[5] === di - 1) { prev.q += r[6]; prev.v += r[7]; }
      });
      function rank(o) { var a = Object.keys(o).map(function (k) { return o[k]; }).filter(function (x) { return x.q || x.v; }).sort(function (a, b) { return b.v - a.v; }), cum = 0; a.forEach(function (x) { cum += x.v; x.cum = cum; }); return a; }
      var almL = rank(alm), canL = rank(can), catL = rank(cats);
      /* SKU: una fila por SKU y categoría dentro de la selección (y categoría elegida) */
      var skuMap = {}, allSkuV = 0, allSkuQ = 0, nSkuSet = {};
      D.inv2.forEach(function (r) {
        if (!inU(r[0]) || !uOk(r[0], r[2])) return;
        var q = r[7 + di]; if (!q) return;
        allSkuQ += q; allSkuV += q * r[6]; if (q > 0) nSkuSet[r[5]] = 1;
        if (!selOk(r[0], r[1]) || (fc >= 0 && r[3] !== fc)) return;
        var k = r[5] + '|' + r[3], s = skuMap[k] || (skuMap[k] = { k: r[5], c: r[3], q: 0, v: 0, loc: {}, rows: [] });
        s.q += q; s.v += q * r[6];
        var lk = r[0] + '|' + r[1]; s.loc[lk] = (s.loc[lk] || 0) + q;
        s.rows.push({ src: r[0], ch: r[1], t: r[2], u: r[4], q: q, cu: r[6], v: q * r[6] });
      });
      var skus = Object.keys(skuMap).map(function (k) { return skuMap[k]; }).sort(function (a, b) { return b.v - a.v; }), cum = 0;
      skus.forEach(function (s, ix) { cum += s.v; s.cum = cum; s.rank = ix + 1; s.cu = s.q ? s.v / s.q : 0; });
      var skuV = skus.reduce(function (a, s) { return a + s.v; }, 0), catV = (fc >= 0 ? (cats[fc] ? cats[fc].v : 0) : catL.reduce(function (a, c) { return a + c.v; }, 0));
      /* conciliación: referencia − suma del desglose = diferencia (sin forzar a cero) */
      var sumAlm = almL.reduce(function (a, x) { return a + x.v; }, 0) + canL.reduce(function (a, x) { return a + x.v; }, 0);
      var rec = [
        { n: 'Total y almacenes + canales', ref: ref.v, sum: sumAlm },
        { n: 'Total y SKU (cantidad × costo unitario)', ref: ref.v, sum: allSkuV },
        { n: (fch != null ? 'Almacén o canal seleccionado' : 'Total') + ' y categorías', ref: sel.v, sum: catL.reduce(function (a, c) { return a + c.v; }, 0) },
        { n: (fc >= 0 ? 'Categoría seleccionada' : fch != null ? 'Almacén o canal seleccionado' : 'Total') + ' y SKU', ref: fc >= 0 ? catV : sel.v, sum: skuV }
      ];
      var ciaL = Object.keys(cias).map(function (k) { var c = cias[k]; c.det = Object.keys(c.det).map(function (d) { return c.det[d]; }).filter(function (x) { return x.q || x.v; }).sort(function (a, b) { return b.v - a.v; }); return c; }).filter(function (x) { return x.q || x.v; }).sort(function (a, b) { return b.v - a.v; });
      rec.push({ n: 'Selección y compañías', ref: fc >= 0 ? catV : sel.v, sum: ciaL.reduce(function (a, x) { return a + x.v; }, 0) });
      rec.forEach(function (x) { x.dif = x.ref - x.sum; x.exacta = Math.abs(x.dif) < 0.005; x.ok = Math.abs(x.dif) < 1; });   // < $1 = solo centavos de redondeo del concentrado (se muestra el importe real)
      return { di: di, ref: ref, prev: prev, cias: ciaL, alm: almL, can: canL, sel: sel, cats: catL, skus: skus, rec: rec, skuV: skuV, skuQ: skus.reduce(function (a, s) { return a + s.q; }, 0), allSkuQ: allSkuQ,
               avg: ref.q > 0 ? ref.v / ref.q : null, nSku: Object.keys(nSkuSet).length, avgPzs: Object.keys(nSkuSet).length ? ref.q / Object.keys(nSkuSet).length : null };
    }

    /* piezas y valor totales (mismo universo que valor()) de cada corte hasta el seleccionado, y su promedio */
    function serie(di, U) {
      U = U || {}; var uf = U.fuente == null ? -1 : U.fuente, ut = setOf(U.t);
      var s = []; for (var k = 0; k <= di; k++) s.push({ di: k, q: 0, v: 0 });
      D.st.forEach(function (r) { if ((r[0] <= 1 || r[0] === iFuera) && r[5] <= di && (uf < 0 || (r[0] === iFuera ? 1 : r[0]) === uf) && (ut == null || ut[r[2]])) { s[r[5]].q += r[6]; s[r[5]].v += r[7]; } });
      var n = s.length;
      return { cortes: s, n: n, avgQ: s.reduce(function (a, x) { return a + x.q; }, 0) / n, avgV: s.reduce(function (a, x) { return a + x.v; }, 0) / n };
    }

    /* tendencia: piezas y valor de cada corte, para el total o para la selección (almacén/canal y categoría); el último punto coincide con valor() */
    function tendencia(F, U) {
      F = F || {}; U = U || {}; var fu = F.fuente == null ? -1 : F.fuente, fch = setOf(F.ch), fc = F.c == null ? -1 : F.c, s = [], k;
      var uf = U.fuente == null ? -1 : U.fuente, ut = setOf(U.t);
      for (k = 0; k < ND; k++) s.push({ di: k, q: 0, v: 0 });
      D.st.forEach(function (r) {
        if (!(r[0] <= 1 || r[0] === iFuera)) return;
        if ((uf >= 0 && (r[0] === iFuera ? 1 : r[0]) !== uf) || (ut != null && !ut[r[2]])) return;
        if ((fu >= 0 && (r[0] === iFuera ? 1 : r[0]) !== fu) || (fch != null && !fch[r[1]]) || (fc >= 0 && r[3] !== fc)) return;
        s[r[5]].q += r[6]; s[r[5]].v += r[7];
      });
      return s;
    }

    /* desglose de un almacén (ERP: por ubicación) o canal (Plataformas: por estatus) al corte, respetando los filtros globales */
    function desglose(di, ch, kind, U) {
      U = U || {}; var uf = U.fuente == null ? -1 : U.fuente, ut = setOf(U.t), o = {};
      D.st.forEach(function (r) {
        if (r[5] !== di || r[1] !== ch || !(kind === 0 ? r[0] === 0 : (r[0] === 1 || r[0] === iFuera))) return;
        if ((uf >= 0 && kind !== uf) || (ut != null && !ut[r[2]])) return;
        var x = o[r[4]] || (o[r[4]] = { u: r[4], name: D.dims.u[r[4]], q: 0, v: 0 }); x.q += r[6]; x.v += r[7];
      });
      return Object.keys(o).map(function (k) { return o[k]; }).filter(function (x) { return x.q || x.v; }).sort(function (a, b) { return b.v - a.v; });
    }

    /* tiendas disponibles para el filtro (según la fuente elegida), de mayor a menor valor al corte */
    function tiendas(di, uf) {
      var o = {};
      D.st.forEach(function (r) {
        if (!(r[0] <= 1 || r[0] === iFuera) || r[5] !== di || (uf >= 0 && (r[0] === iFuera ? 1 : r[0]) !== uf)) return;
        var x = o[r[2]] || (o[r[2]] = { t: r[2], name: D.dims.t[r[2]], q: 0, v: 0 }); x.q += r[6]; x.v += r[7];
      });
      return Object.keys(o).map(function (k) { return o[k]; }).filter(function (x) { return x.q || x.v; }).sort(function (a, b) { return b.v - a.v; });
    }

    /* ---------- Movimientos y advertencias ----------
       Los movimientos salen de comparar cortes consecutivos (mv): un aumento de existencias es una entrada y una baja es una salida.
       Universo: ERP + Plataformas (estatus que ya contaba el movimiento). F = {ch, c} selección; U = {fuente, t} filtros globales.
       Traspaso interno = lo que, para un mismo SKU y fuente, sale de un lugar y entra a otro en el mismo corte (se queda dentro del inventario). */
    function cutSel(ds) {
      var a = [], k, seen = {};
      if (Array.isArray(ds)) ds.forEach(function (x) { if (x >= 0 && x < ND && !seen[x]) { seen[x] = 1; a.push(x); } }); else for (k = 0; k <= ds; k++) a.push(k);
      return a.sort(function (x, y) { return x - y; });
    }
    function days(a, b) { return Math.round((Date.parse(D.dates[b]) - Date.parse(D.dates[a])) / 864e5); }
    function movFiltro(F, U) {
      F = F || {}; U = U || {};
      var fch = setOf(F.ch), fc = F.c == null ? -1 : F.c, uf = U.fuente == null ? -1 : U.fuente, ut = setOf(U.t);
      return function (r) { return r[0] <= 1 && (uf < 0 || r[0] === uf) && (ut == null || ut[r[2]]) && (fch == null || fch[r[1]]) && (fc < 0 || r[3] === fc); };
    }
    function movimientos(dsel, F, U) {
      var sel = cutSel(dsel), di = sel[sel.length - 1], ok = movFiltro(F, U), cuts = [], cm = {}, k, per = {}, sk = {}, tot = { e: 0, s: 0, ve: 0, vs: 0 }, skuAll = {}, pos = {};
      sel.forEach(function (k) { if (k < 1) return; var c = { di: k, prev: k - 1, dias: days(k - 1, k), e: 0, s: 0, ve: 0, vs: 0, skus: {}, ch: {}, u: {}, sk: {}, par: {} }; pos[k] = cuts.length; cuts.push(c); cm[k] = c; });
      D.mv.forEach(function (r) {
        if (!cm[r[6]] || !ok(r)) return;
        var c = cm[r[6]], dq = r[7], dv = r[8], ent = dq > 0, a = Math.abs(dq), av = Math.abs(dv);
        if (ent) { c.e += a; c.ve += av; tot.e += a; tot.ve += av; } else { c.s += a; c.vs += av; tot.s += a; tot.vs += av; }
        c.skus[r[5]] = 1; skuAll[r[5]] = 1;
        var kc = r[0] + '|' + r[1] + '|' + r[2], xc = c.ch[kc] || (c.ch[kc] = { src: r[0], ch: r[1], t: r[2], e: 0, s: 0, ve: 0, vs: 0 });
        var ku = r[0] + '|' + r[4], xu = c.u[ku] || (c.u[ku] = { src: r[0], u: r[4], e: 0, s: 0, ve: 0, vs: 0 });
        var xs = c.sk[r[5]] || (c.sk[r[5]] = { k: r[5], e: 0, s: 0, ve: 0, vs: 0 });
        var kp = r[0] + '|' + r[5], xp = c.par[kp] || (c.par[kp] = { iq: 0, iv: 0, oq: 0, ov: 0 });
        [xc, xu, xs].forEach(function (x) { if (ent) { x.e += a; x.ve += av; } else { x.s += a; x.vs += av; } });
        if (ent) { xp.iq += a; xp.iv += av; } else { xp.oq += a; xp.ov += av; }
        var s = sk[r[5]] || (sk[r[5]] = { k: r[5], e: 0, s: 0, ve: 0, vs: 0, cut: new Array(cuts.length).fill(0), ch: {} });
        if (ent) { s.e += a; s.ve += av; } else { s.s += a; s.vs += av; }
        s.cut[pos[r[6]]] += av; s.ch[r[1]] = (s.ch[r[1]] || 0) + av;
      });
      cuts.forEach(function (c) {
        c.iq = 0; c.iv = 0;
        Object.keys(c.par).forEach(function (kp) { var x = c.par[kp], m = Math.min(x.iq, x.oq); if (m > 0) { c.iq += m; c.iv += m * (x.iv / x.iq + x.ov / x.oq) / 2; } });
        c.mov = c.ve + c.vs; c.nSku = Object.keys(c.skus).length;
      });
      var peak = null; cuts.forEach(function (c) { if (c.mov > 0 && (!peak || c.mov > peak.mov)) peak = c; });
      function lst(o) { return Object.keys(o).map(function (q) { return o[q]; }); }
      var pk = null;
      if (peak) {
        pk = { di: peak.di, prev: peak.prev, dias: peak.dias, e: peak.e, s: peak.s, ve: peak.ve, vs: peak.vs, iq: peak.iq, iv: peak.iv, mov: peak.mov, nSku: peak.nSku,
          neQ: peak.e - peak.iq, nsQ: peak.s - peak.iq, neV: peak.ve - peak.iv, nsV: peak.vs - peak.iv,
          ch: lst(peak.ch).map(function (x) { x.name = D.dims.ch[x.ch]; x.tienda = D.dims.t[x.t]; x.fuente = x.src === 0 ? 'ERP' : 'Plataformas'; return x; }).sort(function (a, b) { return (b.ve + b.vs) - (a.ve + a.vs); }),
          u: lst(peak.u).map(function (x) { x.name = D.dims.u[x.u]; x.fuente = x.src === 0 ? 'ERP' : 'Plataformas'; return x; }).sort(function (a, b) { return (b.ve + b.vs) - (a.ve + a.vs); }),
          skus: lst(peak.sk).map(function (x) { x.sku = D.skus[x.k]; x.tit = D.tit[x.k]; x.mov = x.ve + x.vs; return x; }).sort(function (a, b) { return b.mov - a.mov; }).slice(0, 5) };
      }
      var top = lst(sk).map(function (s) {
        s.sku = D.skus[s.k]; s.tit = D.tit[s.k]; s.cat = D.dims.c[D.skc[s.k]]; s.mov = s.ve + s.vs; s.movQ = s.e + s.s; s.neto = s.ve - s.vs; s.netoQ = s.e - s.s;
        var bi = 0; s.cut.forEach(function (v, i) { if (v > s.cut[bi]) bi = i; }); s.pico = cuts[bi] ? cuts[bi].di : 0;
        var bc = null; Object.keys(s.ch).forEach(function (q) { if (bc == null || s.ch[q] > s.ch[bc]) bc = q; }); s.lugar = bc == null ? '' : D.dims.ch[+bc];
        return s;
      }).sort(function (a, b) { return b.mov - a.mov; });
      return { di: di, ok: cuts.length > 0, cuts: cuts, tot: tot, nSku: Object.keys(skuAll).length, peak: pk, top4: top.slice(0, 4), nTop: top.length, dias: cuts.reduce(function (a, c) { return a + c.dias; }, 0) };
    }

    /* SKU con existencia al corte que no tuvieron ningún movimiento entre el primer corte y el seleccionado */
    function sinMov(dsel, F, U) {
      F = F || {}; var sel = cutSel(dsel), di = sel[sel.length - 1], cs = {}, nC = 0, dd = 0, okM = movFiltro(F, U), moved = {}, all = {}, base = { n: 0, q: 0, v: 0 }, dead = {}, tq = 0, tv = 0;
      sel.forEach(function (k) { if (k >= 1) { cs[k] = 1; nC++; dd += days(k - 1, k); } });
      D.mv.forEach(function (r) { if (cs[r[6]] && okM(r)) moved[r[5]] = 1; });
      D.inv2.forEach(function (r) {
        if (!okM(r)) return; var q = r[7 + di]; if (!q) return;
        var v = q * r[6]; tq += q; tv += v;
        var a = all[r[5]] || (all[r[5]] = { k: r[5], q: 0, v: 0, rows: [] }); a.q += q; a.v += v; a.rows.push({ src: r[0], ch: r[1], c: r[3], q: q, v: v });
      });
      var skus = [], byCh = {}, byCat = {}, tot = { n: 0, q: 0, v: 0 }, nAll = Object.keys(all).length, chAll = {};
      Object.keys(all).forEach(function (k) {
        var a = all[k]; a.rows.forEach(function (x) { var kc = x.src + '|' + x.ch, y = chAll[kc] || (chAll[kc] = { q: 0, v: 0 }); y.q += x.q; y.v += x.v; });
        if (moved[k]) return;
        var locs = {}; a.rows.forEach(function (x) { locs[D.dims.ch[x.ch]] = (locs[D.dims.ch[x.ch]] || 0) + x.v; });
        var lugares = Object.keys(locs).sort(function (p, q) { return locs[q] - locs[p]; });
        skus.push({ k: +k, sku: D.skus[k], tit: D.tit[k], cat: D.dims.c[D.skc[k]], c: D.skc[k], q: a.q, v: a.v, cu: a.q ? a.v / a.q : 0, lugares: lugares });
        tot.n++; tot.q += a.q; tot.v += a.v;
        var seen = {}; a.rows.forEach(function (x) {
          var kc = x.src + '|' + x.ch, y = byCh[kc] || (byCh[kc] = { src: x.src, ch: x.ch, name: D.dims.ch[x.ch], fuente: x.src === 0 ? 'ERP' : 'Plataformas', n: 0, q: 0, v: 0 });
          if (!seen[kc]) { y.n++; seen[kc] = 1; } y.q += x.q; y.v += x.v;
        });
        var cc = byCat[D.skc[k]] || (byCat[D.skc[k]] = { c: D.skc[k], name: D.dims.c[D.skc[k]], n: 0, q: 0, v: 0 }); cc.n++; cc.q += a.q; cc.v += a.v;
      });
      function lst(o) { return Object.keys(o).map(function (q) { return o[q]; }).sort(function (a, b) { return b.v - a.v; }); }
      var chL = lst(byCh); chL.forEach(function (x) { var t0 = chAll[x.src + '|' + x.ch]; x.totV = t0 ? t0.v : 0; });
      skus.sort(function (a, b) { return b.v - a.v; });
      return { ok: nC > 0, di: di, dias: dd, tot: tot, nAll: nAll, totQ: tq, totV: tv, skus: skus, ch: chL, cat: lst(byCat) };
    }

    /* Movimiento de un SKU por corte (hasta di) con los mismos filtros: existencia, entradas y salidas, y en qué lugares se movió */
    function movSku(sk, dsel, F, U) {
      var sel = cutSel(dsel), di = sel[sel.length - 1], ok = movFiltro(F, U), cuts = [], cm = {}, lug = {}, hoy = [], dd = 0;
      sel.forEach(function (k) { var c = { di: k, dias: k ? days(k - 1, k) : 0, q: 0, v: 0, e: 0, s: 0, ve: 0, vs: 0 }; cm[k] = c; cuts.push(c); if (k) dd += c.dias; });
      D.inv2.forEach(function (r) {
        if (r[5] !== sk || !ok(r)) return;
        sel.forEach(function (z) { var q = r[7 + z]; if (q) { cm[z].q += q; cm[z].v += q * r[6]; } });
        var qh = r[7 + di]; if (qh) hoy.push({ fuente: r[0] === 0 ? 'ERP' : 'Plataformas', ch: D.dims.ch[r[1]], t: D.dims.t[r[2]], u: D.dims.u[r[4]], q: qh, cu: r[6], v: qh * r[6] });
      });
      D.mv.forEach(function (r) {
        if (r[5] !== sk || r[6] < 1 || !cm[r[6]] || !ok(r)) return;
        var c = cm[r[6]], a = Math.abs(r[7]), av = Math.abs(r[8]), ent = r[7] > 0;
        if (ent) { c.e += a; c.ve += av; } else { c.s += a; c.vs += av; }
        var kk = r[0] + '|' + r[1] + '|' + r[2] + '|' + r[4], x = lug[kk] || (lug[kk] = { fuente: r[0] === 0 ? 'ERP' : 'Plataformas', ch: D.dims.ch[r[1]], t: D.dims.t[r[2]], u: D.dims.u[r[4]], e: 0, s: 0, ve: 0, vs: 0 });
        if (ent) { x.e += a; x.ve += av; } else { x.s += a; x.vs += av; }
      });
      var tot = { e: 0, s: 0, ve: 0, vs: 0 }, ult = null, pico = null;
      cuts.forEach(function (c) { tot.e += c.e; tot.s += c.s; tot.ve += c.ve; tot.vs += c.vs; if (c.e + c.s > 0) { ult = c.di; if (!pico || c.ve + c.vs > pico.ve + pico.vs) pico = c; } });
      var lugares = Object.keys(lug).map(function (q) { return lug[q]; }).sort(function (a, b) { return (b.ve + b.vs) - (a.ve + a.vs); });
      hoy.sort(function (a, b) { return b.v - a.v; });
      return { sku: D.skus[sk], tit: D.tit[sk], cat: D.dims.c[D.skc[sk]], cuts: cuts, tot: tot, ult: ult, pico: pico ? pico.di : null, lugares: lugares, hoy: hoy, nCortes: cuts.filter(function (c) { return c.di >= 1; }).length,
        q: cm[di].q, v: cm[di].v, mov: tot.ve + tot.vs, diasSin: ult == null ? dd : days(ult, di) };
    }

    /* indicadores de concentración sobre una lista de SKU ya ordenada por valor descendente */
    function concentracion(list, total) {
      var n = list.length, out = { n: n, top10: 0, top20: 0, n80: 0, n80pct: 0, shown10: Math.min(10, n), shown20: Math.min(20, n) }; if (!n || !(total > 0)) return out;
      var cum = 0, got = false;
      list.forEach(function (s, i) { cum += s.v; if (i === 9) out.top10 = cum / total; if (i === 19) out.top20 = cum / total; if (!got && cum / total >= 0.8) { out.n80 = i + 1; got = true; } });
      if (n < 10) out.top10 = cum / total;
      if (n < 20) out.top20 = cum / total;
      if (!got) out.n80 = n;
      out.n80pct = out.n80 / n; return out;
    }

    /* validaciones del corte (sin filtros): cada alerta trae sus registros de origen */
    function validar(di, v) {
      var cn = function (i) { return D.dims.c[i]; }, A = { sinCosto: [], sinCategoria: [], duplicados: [], invalidos: [], catalogo: [] }, dup = {};
      function reg(r, q) { return { fuente: D.dims.src[r[0]], ch: D.dims.ch[r[1]], t: D.dims.t[r[2]], c: cn(r[3]), u: D.dims.u[r[4]], sku: D.skus[r[5]], tit: D.tit[r[5]], q: q, cu: r[6], v: q * r[6] }; }
      D.inv2.forEach(function (r) {
        if (!(r[0] <= 1 || r[0] === iFuera)) return; var q = r[7 + di]; if (!q) return;
        if (q > 0 && !(r[6] > 0)) A.sinCosto.push(reg(r, q));
        if (q > 0 && /^(sin dato|sin categor[ií]a|)$/i.test(cn(r[3]).trim())) A.sinCategoria.push(reg(r, q));
        if (q < 0 || !isFinite(q) || !isFinite(r[6]) || r[6] < 0) A.invalidos.push(reg(r, q));
        var t = D.tit[r[5]]; if (q > 0 && (!t || /^sin nombre/i.test(t))) A.catalogo.push(reg(r, q));
        var k = r[0] + '|' + r[1] + '|' + r[2] + '|' + r[4] + '|' + r[5]; (dup[k] || (dup[k] = [])).push(reg(r, q));
      });
      Object.keys(dup).forEach(function (k) { var L = dup[k], cs = {}; L.forEach(function (x) { cs[x.c] = 1; }); if (Object.keys(cs).length > 1) L.forEach(function (x) { A.duplicados.push(x); }); });
      D.st.forEach(function (r) { if ((r[0] <= 1 || r[0] === iFuera) && r[5] === di && (r[6] < 0 || r[7] < 0 || !isFinite(r[7]))) A.invalidos.push({ fuente: D.dims.src[r[0]], ch: D.dims.ch[r[1]], t: D.dims.t[r[2]], c: cn(r[3]), u: D.dims.u[r[4]], sku: '(agregado)', tit: '', q: r[6], cu: 0, v: r[7] }); });
      var dif = v.rec.filter(function (x) { return !x.ok; });
      function sum(L) { return { n: L.length, q: L.reduce(function (a, x) { return a + x.q; }, 0), v: L.reduce(function (a, x) { return a + x.v; }, 0), rows: L.sort(function (a, b) { return b.v - a.v; }) }; }
      return { sinCosto: sum(A.sinCosto), sinCategoria: sum(A.sinCategoria), duplicados: sum(A.duplicados), invalidos: sum(A.invalidos), catalogo: sum(A.catalogo), diferencias: { n: dif.length, rows: dif } };
    }

    /* ficha de un SKU: existencia por fuente, almacén/canal, tienda y ubicación/estatus al corte, más disponible y reservado del ERP si existen */
    function ficha(di, sk) {
      var rows = [], dispRows = [], cl = { disponible: null };
      D.inv2.forEach(function (r) {
        if (r[5] !== sk) return; var q = r[7 + di];
        if (r[0] === iDisp && q) { cl.disponible = (cl.disponible || 0) + q; dispRows.push({ ch: D.dims.ch[r[1]], t: D.dims.t[r[2]], q: q, cu: r[6], v: q * r[6] }); }
        if ((r[0] <= 1 || r[0] === iFuera) && q) rows.push({ fuente: D.dims.src[r[0]], ch: D.dims.ch[r[1]], t: D.dims.t[r[2]], c: D.dims.c[r[3]], u: D.dims.u[r[4]], q: q, cu: r[6], v: q * r[6], aptas: r[0] === 1 && !!vendSet[r[4]] });
      });
      rows.sort(function (a, b) { return b.v - a.v; });
      var tieneD = !!(D.has && D.has[iDisp] && D.has[iDisp].indexOf(di) >= 0);
      var vp = { q: 0, v: 0 }; rows.forEach(function (x) { if (x.aptas) { vp.q += x.q; vp.v += x.v; } });
      var ve = { q: 0, v: 0 }; dispRows.forEach(function (x) { ve.q += x.q; ve.v += x.v; });
      var venta = { erp: ve, plat: vp, q: (tieneD ? ve.q : 0) + vp.q, v: (tieneD ? ve.v : 0) + vp.v, tieneD: tieneD };
      return { venta: venta, sku: D.skus[sk], tit: D.tit[sk], rows: rows, q: rows.reduce(function (a, x) { return a + x.q; }, 0), v: rows.reduce(function (a, x) { return a + x.v; }, 0), disponible: cl.disponible, dispRows: dispRows.sort(function (a, b) { return b.q - a.q; }), tieneDisp: !!(D.has && D.has[iDisp] && D.has[iDisp].indexOf(di) >= 0) };
    }

    return { D: D, ND: ND, iDisp: iDisp, iRes: iRes, vendSet: vendSet, options: options, srcFilter: srcFilter, erpBase: erpBase, inSet: inSet,
             compute: compute, topProducts: topProducts, summary: summary, lowRot: lowRot, noMov: noMov,
             valor: valor, serie: serie, tendencia: tendencia, tiendas: tiendas, desglose: desglose, movimientos: movimientos, sinMov: sinMov, movSku: movSku, concentracion: concentracion, validar: validar, ficha: ficha };
  }

  g.InvEngine = { create: create };
  if (typeof module !== 'undefined') module.exports = g.InvEngine;
})(typeof window !== 'undefined' ? window : globalThis);
