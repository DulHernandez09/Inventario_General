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
    var ND = D.dates.length, iDisp = D.dims.src.indexOf('ERP · Disponible'), iRes = D.dims.src.indexOf('ERP · Reservado'), iMer = D.dims.src.indexOf('ERP · Mermas'), iVp = D.dims.src.indexOf('ERP · Venta plataforma'), iOut = D.dims.src.indexOf('ERP · Venta Outlet');
    var cache = {}, skuRowsCache = {};
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

    return { D: D, ND: ND, iDisp: iDisp, iRes: iRes, vendSet: vendSet, options: options, srcFilter: srcFilter, erpBase: erpBase, inSet: inSet,
             compute: compute, topProducts: topProducts, summary: summary, lowRot: lowRot, noMov: noMov };
  }

  g.InvEngine = { create: create };
  if (typeof module !== 'undefined') module.exports = g.InvEngine;
})(typeof window !== 'undefined' ? window : globalThis);
