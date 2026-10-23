// Pruebas del motor de cálculo (js/engine.js) contra data/dashboard_data.js.   Uso: node tests/test_engine.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data', 'dashboard_data.js'), 'utf8'), ctx);
const Engine = require(path.join(root, 'js', 'engine.js'));
const D = ctx.window.DASHBOARD_DATA, E = Engine.create(D);

let fails = 0, n = 0;
function ok(cond, msg, extra) { n++; if (!cond) { fails++; console.log('  FALLA  ' + msg + (extra !== undefined ? '  → ' + extra : '')); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= (tol || 0.5), msg, a + ' vs ' + b); }
const base = () => ({ mode: 'all', et: 't', ch: -1, ts: [], cs: [], us: [], q: '', ds: [], sort: 'total', lrB: 'all' });
const last = D.dates.length - 1;

// 1. Sin filtros: las existencias del motor cuadran con los datos agregados (st) y con el detalle por SKU (inv2)
{
  const S = base(), C = E.compute(S), d1 = C.d1;
  ok(d1 === last, 'el último corte seleccionado es el último disponible');
  let q = 0, v = 0, qi = 0, vi = 0;
  D.st.forEach(r => { if (r[0] <= 1 && r[5] === d1) { q += r[6]; v += r[7]; } });
  D.inv2.forEach(r => { if (r[0] <= 1) { qi += r[7 + d1]; vi += r[7 + d1] * r[6]; } });
  near(C.invU[d1], q, 0, 'invU = suma de st (ERP + Plataformas)');
  near(C.invV[d1], v, 0.5, 'invV = suma de st');
  near(qi, q, 0, 'inv2 (por SKU) suma lo mismo que st', qi + ' vs ' + q);
  near(vi, v, v * 0.0005, 'inv2 valorizado ≈ st (costo promedio)', vi + ' vs ' + v);
  ok(C.invU[d1] === C.A(0, d1).q + C.A(1, d1).q, 'Todos = ERP + Plataformas (sin sumar disponible/reservado)');
}

// 2. Desgloses: canal, ubicación, almacén y estatus suman el total de su fuente (sin duplicar)
{
  const C = E.compute(base()), d1 = C.d1;
  const sum = o => Object.values(o).reduce((a, x) => a + x.q, 0);
  near(sum(C.byUb), C.A(0, d1).q, 0, 'ubicaciones ERP suman el ERP total');
  near(sum(C.byAl), C.A(0, d1).q, 0, 'almacenes ERP suman el ERP total');
  near(sum(C.byEs), C.A(1, d1).q, 0, 'estatus Plataformas suman el total Plataformas');
  near(sum(C.canal), C.invU[d1], 0, 'canales (ERP + cada plataforma) suman el total');
  near(C.platV[d1].q + C.platN[d1].q, C.A(1, d1).q, 0, 'vendible + no vendible = total Plataformas');
  let m = 0; Object.values(C.matAU).forEach(r => Object.values(r).forEach(x => m += x.q));
  near(m, C.A(0, d1).q, 0, 'matriz almacén × ubicación suma el ERP total');
}

// 3. Resumen ejecutivo: la clasificación cuadra con el total
{
  const S = base(), C = E.compute(S), R = E.summary(S, C), c = R.cur;
  near(c.vend.q + c.nov.q + c.com.q + c.sinClas.q, c.tot.q, 0, 'vendible + no vendible + comprometido + sin clasificar = total (piezas)');
  near(c.vend.v + c.nov.v + c.com.v + c.sinClas.v, c.tot.v, 0.5, '… y en valor');
  ok(c.hasD, 'hay archivo de disponible en el último corte');
  ok(R.prev && R.prev.tot.q === C.invU[C.pv], 'el corte anterior del resumen es el previo de la selección');
  const P = E.summary({ ...base(), mode: 'plat' }, E.compute({ ...base(), mode: 'plat' })).cur;
  near(P.sinClas.q, 0, 0, 'en Plataformas todo el inventario queda clasificado por estatus');
  near(P.vend.q, D.st.filter(r => r[0] === 1 && r[5] === last && E.vendSet[r[4]]).reduce((a, r) => a + r[6], 0), 0, 'vendible Plataformas = estatus "Aptas para vender"');
}

// 4. Movimientos: entradas − salidas acumuladas = cambio de inventario (conservación entre cortes)
{
  const C = E.compute({ ...base(), mode: 'plat' }), n1 = D.dates.length;
  const netPlat = D.mv.filter(r => r[0] === 1).reduce((a, r) => a + r[7], 0);
  near(netPlat, C.invU[n1 - 1] - C.invU[0], 0, 'Plataformas: Σ movimientos = inventario final − inicial', netPlat + ' vs ' + (C.invU[n1 - 1] - C.invU[0]));
  const Ce = E.compute({ ...base(), mode: 'erp' });
  const netErp = D.mv.filter(r => r[0] === 0).reduce((a, r) => a + r[7], 0);
  near(netErp, Ce.invU[n1 - 1] - Ce.invU[0], 0, 'ERP: Σ movimientos = inventario final − inicial');
  const pe = Ce.periods.reduce((a, p) => a + p.e - p.s, 0);
  near(pe, Ce.invU[n1 - 1] - Ce.invU[0], 0, 'ERP: suma de periodos entre cortes = cambio total');
}

// 5. Filtros: el filtro de plataforma y de ubicación se respeta también en SKU nuevos y baja rotación
{
  const amazon = D.dims.ch.indexOf('AMAZON');
  const S = { ...base(), mode: 'plat', ch: amazon }, C = E.compute(S);
  const stQ = D.st.filter(r => r[0] === 1 && r[1] === amazon && r[5] === last).reduce((a, r) => a + r[6], 0);
  near(C.invU[last], stQ, 0, 'filtro Amazon: existencias');
  const agQ = Object.values(C.ag).reduce((a, x) => a + x.q, 0);
  near(agQ, stQ, 0, 'filtro Amazon: baja rotación/SKU nuevos parten de la misma existencia', agQ + ' vs ' + stQ);
  const apt = D.dims.u.indexOf('Aptas para vender'), S2 = { ...base(), mode: 'plat', us: [apt, D.dims.u.indexOf('No aptas para vender')] };
  const C2 = E.compute(S2), q2 = D.st.filter(r => r[0] === 1 && (r[4] === apt || r[4] === D.dims.u.indexOf('No aptas para vender')) && r[5] === last).reduce((a, r) => a + r[6], 0);
  near(C2.invU[last], q2, 0, 'filtro de estatus: existencias');
  near(Object.values(C2.ag).reduce((a, x) => a + x.q, 0), q2, 0, 'filtro de estatus: baja rotación');
  const Cq = E.compute({ ...base(), q: 'zzzz-no-existe' });
  ok(Cq.news.length === 0 && Object.keys(Cq.bySku).length === 0, 'búsqueda sin coincidencias → sin SKU');
}

// 6. Regresión: cifras conocidas con los concentrados de octubre (corte 21-oct; inventario = ERP + Plataformas aptas y no aptas)
{
  const C = E.compute(base()), L = E.lowRot(C);
  ok(C.news.length === 57, 'SKU nuevos al 23-oct (contra el 21-oct) = 57', C.news.length);
  ok(L.nZ === 1838 && L.nL === 262, 'baja rotación: 1,838 sin salidas y 262 con < 5 %', L.nZ + ' / ' + L.nL);
  const fuera = D.meta.excluido.estatus, dentro = ['Aptas para vender', 'No aptas para vender'];
  ok(fuera.length === 5 && ['Pendientes de ingreso', 'En transferencia', 'Devueltas por el comprador', 'En revisión', 'Extraviadas (en búsqueda)'].every(n => fuera.includes(n)), 'fuera del inventario: en camino (3) y procesos internos (2)', fuera.join(', '));
  ok(!D.dims.u.some((u, i) => fuera.includes(u) && D.st.some(r => r[4] === i)), 'los estatus fuera del inventario no están en las existencias');
  ok(dentro.every(n => D.dims.u.some((u, i) => u === n && D.st.some(r => r[0] === 1 && r[4] === i))), 'Plataformas cuenta como inventario solo con aptas y no aptas');
  const sU = (di, names) => D.st.filter(r => r[0] === 1 && r[5] === di && names.some(n => D.dims.u.indexOf(n) === r[4])).reduce((a2, r) => a2 + r[6], 0);
  near(C.A(1, last).q, sU(last, dentro), 0, 'inventario de Plataformas = aptas + no aptas');
  const top = E.topProducts(C, 'AMAZON', 5);
  ok(top.length === 5 && top[0].v >= top[1].v, 'top productos por canal ordenado por valor');
  const iD = D.dims.src.indexOf('ERP · Disponible'), dq = di => D.st.filter(r => r[0] === iD && r[5] === di).reduce((s2, r) => s2 + r[6], 0);
  const dis = E.compute({ ...base(), mode: 'erp', et: 'd', ds: [last] });
  near(dis.invU[last], dq(last), 0, 'ERP disponible al último corte = ' + dq(last).toLocaleString('en-US'));
  ok(D.has[iD].length === 2 && D.has[iD][0] === last - 1 && dis.pv === last - 1, 'disponible tiene dos cortes (' + D.dates[last - 1] + ' y ' + D.dates[last] + '): la variación se mide contra el anterior');
  near(dis.invU[dis.pv], dq(last - 1), 0, 'ERP disponible en el corte anterior = ' + dq(last - 1).toLocaleString('en-US'));
  ok(E.compute({ ...base(), mode: 'erp', et: 'd', ds: [0] }).pv === -1, 'disponible sin corte anterior disponible no inventa variación (primer corte)');
}

// 7. Inventario sin movimiento y periodos entre cortes
{
  const C = E.compute(base()), NM = E.noMov(C), agV = Object.values(C.ag).reduce((a, x) => a + x.v, 0), agQ = Object.values(C.ag).reduce((a, x) => a + x.q, 0);
  ok(NM.tot.n === Object.keys(C.ag).length, 'sin movimiento: cuenta todos los SKU con existencia', NM.tot.n);
  near(NM.b.reduce((a, x) => a + x.v, 0), agV, 0.5, 'sin movimiento: los 4 rangos suman el valor con existencia');
  near(NM.b.reduce((a, x) => a + x.q, 0), agQ, 0, 'sin movimiento: los 4 rangos suman las piezas con existencia');
  ok(C.periods.length === D.dates.length - 1, 'un periodo entre cada par de cortes consecutivos', C.periods.length);
  const one = E.compute({ ...base(), ds: [last] });
  ok(one.periods.length === 1 && one.periods[0].from === last - 1, 'con un solo corte el periodo se mide contra el corte anterior');
  const sinPrev = E.compute({ ...base(), ds: [0] });
  ok(sinPrev.pv < 0 && sinPrev.periods.length === 0 && sinPrev.news.length === 0, 'primer corte: sin periodo ni SKU nuevos (no se inventan)');
}

// 8. Resumen ejecutivo: total = ERP + Plataformas; inventario para venta = ERP disponible + Plataformas aptas; categorías; SKU nuevos por fuente
{
  const S = base(), C = E.compute(S), R = E.summary(S, C), c = R.cur, d1 = C.d1;
  near(c.totErp.q + c.totPlat.q, c.tot.q, 0, 'total de inventario = ERP + Plataformas (piezas)');
  near(c.totErp.v + c.totPlat.v, c.tot.v, 0.5, 'total de inventario = ERP + Plataformas (valor)');
  near(c.ven.q, c.venErp.q + c.venPlat.q, 0, 'inventario para venta = ERP disponible + Plataformas aptas');
  near(c.venErp.q, D.st.filter(r => r[0] === E.iDisp && r[5] === d1).reduce((s2, r) => s2 + r[6], 0), 0, 'ERP disponible del último corte');
  near(c.venPlat.q, D.st.filter(r => r[0] === 1 && r[5] === d1 && E.vendSet[r[4]]).reduce((a, r) => a + r[6], 0), 0, 'Plataformas aptas = estatus "Aptas para vender"');
  ok(R.prev && R.prev.hasD && R.prev.venErp.q === D.st.filter(r => r[0] === E.iDisp && r[5] === C.pv).reduce((s2, r) => s2 + r[6], 0), 'ERP disponible: el corte anterior trae su propio disponible');
  ok(E.summary(base(), E.compute({ ...base(), ds: [last - 3, last - 2] })).cur.hasD === false, 'sin archivo de disponible en un corte no se inventa disponible');
  const sumCat = Object.values(C.byCat).reduce((a, x) => a + x.q, 0), sumCatV = Object.values(C.byCat).reduce((a, x) => a + x.v, 0);
  near(sumCat, C.invU[d1], 0, 'las categorías suman todo el inventario (piezas)');
  near(sumCatV, C.invV[d1], 0.5, 'las categorías suman todo el inventario (valor)');
  const mE = Object.values(C.byCatMov).reduce((a, x) => a + x.e, 0), mS = Object.values(C.byCatMov).reduce((a, x) => a + x.s, 0);
  near(mE, C.per.e, 0, 'movimiento por categoría: entradas = entradas del periodo'); near(mS, C.per.s, 0, 'movimiento por categoría: salidas = salidas del periodo');
  const sumT = o => Object.values(o).reduce((a, m) => a + Object.values(m).reduce((b, x) => b + x.q, 0), 0);
  near(sumT(C.byCatT), C.invU[d1], 0, 'categoría × tienda suma todo el inventario (cada bloque puede mostrar sus tiendas)');
  const mvT = Object.values(C.byCatMovT).reduce((a, m) => a + Object.values(m).reduce((b, x) => b + x.e + x.s, 0), 0);
  near(mvT, C.per.e + C.per.s, 0, 'categoría × tienda: piezas movidas = entradas + salidas del periodo');
  for (const src of [0, 1]) {
    const mine = D.mv.filter(r => r[0] === src && r[6] > C.ps && r[6] <= d1);
    const eE = mine.filter(r => r[7] > 0).reduce((s, r) => s + r[7], 0), eS = -mine.filter(r => r[7] < 0).reduce((s, r) => s + r[7], 0);
    const gE = Object.values(C.byCatMovS).reduce((s, g) => s + g[src].e, 0), gS = Object.values(C.byCatMovS).reduce((s, g) => s + g[src].s, 0);
    near(gE, eE, 0, 'categorías ' + ['ERP', 'Plataformas'][src] + ': entradas = movimientos de esa fuente'); near(gS, eS, 0, 'categorías ' + ['ERP', 'Plataformas'][src] + ': salidas = movimientos de esa fuente');
  }
  for (const src of [0, 1]) {
    const tv = Object.values(C.byCatMovTS[src]).reduce((s2, m) => s2 + Object.values(m).reduce((b, x) => b + x.ve + x.vs, 0), 0), gv = Object.values(C.byCatMovS).reduce((s2, g) => s2 + g[src].ve + g[src].vs, 0);
    near(tv, gv, 0.5, 'categoría × tienda de ' + ['ERP', 'Plataformas'][src] + ' suma el valor movido de esa fuente');
  }
  for (const src of [0, 1]) {
    let i0 = 0, i1 = 0, ve = 0, vs = 0, ok2 = true;
    Object.values(C.catIni).forEach(x => { i0 += x[src].v; }); Object.values(C.catFin).forEach(x => { i1 += x[src].v; });
    Object.values(C.byCatMovS).forEach(m => { const g = m[src]; ve += g.ve; vs += g.vs; if (g.iq > g.e + 1e-6 || g.iq > g.s + 1e-6) ok2 = false; });
    near(i0 + ve - vs, i1, 0.5, ['ERP', 'Plataformas'][src] + ': tenía + entró − salió = tiene (valor)');
    ok(ok2, ['ERP', 'Plataformas'][src] + ': los cambios internos nunca superan las entradas ni las salidas');
    near(i0, C.A(src, C.ps).v, 0.01, ['ERP', 'Plataformas'][src] + ': existencia inicial por categoría = total de la fuente');
  }
  for (const g of [0, 1]) {
    const b = C.bridge[g], nom = ['ERP', 'Plataformas'][g];
    near(b.ini.q + b.nuevos.q + b.ent.q - b.sal.q, b.fin.q, 0, nom + ': inventario anterior + SKU nuevos + entradas − salidas = inventario actual (piezas)');
    near(b.ini.v + b.nuevos.v + b.ent.v - b.sal.v, b.fin.v, 1, nom + ': el mismo cuadre en valor');
    ok(b.nuevos.n === (g === 0 ? C.newsErp : C.newsPlat).length && b.agot.n >= 0, nom + ': el puente usa los mismos SKU nuevos que la tarjeta');
  }
  ok(E.compute({ ...base(), ds: [0] }).bridge[0] === null, 'sin corte anterior no hay puente (no se inventa)');
  let mt = 0; Object.values(C.matATU).forEach(c => Object.values(c.u).forEach(x => { mt += x.q; }));
  near(mt, C.A(0, d1).q, 0, 'matriz almacén × tienda × ubicación suma el ERP total');
  ok(Object.values(C.matATU).every(c => D.dims.ch[c.ch] && D.dims.t[c.t]), 'cada fila de la matriz trae su almacén y su tienda');
  const Ce = E.compute({ ...base(), mode: 'erp' }), Cp = E.compute({ ...base(), mode: 'plat' });
  ok(Ce.newsErp.length === Ce.news.length && Ce.newsPlat.length === 0, 'SKU nuevos con fuente ERP: solo ERP');
  ok(Cp.newsPlat.length === Cp.news.length && Cp.newsErp.length === 0, 'SKU nuevos con fuente Plataformas: solo Plataformas');
  ok(C.newsErp.length > 0 && C.newsPlat.length > 0, 'SKU nuevos de ERP y de Plataformas se calculan por separado', C.newsErp.length + ' / ' + C.newsPlat.length);
  const qty = (src, k, di) => D.inv2.filter(r => r[0] === src && r[5] === k).reduce((s, r) => s + r[7 + di], 0);
  ok(C.newsErp.slice(0, 40).every(x => qty(0, x.k, C.pv) <= 0 && qty(0, x.k, d1) > 0), 'cada SKU nuevo de ERP no tenía existencia ERP en el corte anterior y sí en el actual');
  ok(C.newsPlat.slice(0, 40).every(x => qty(1, x.k, C.pv) <= 0 && qty(1, x.k, d1) > 0), 'cada SKU nuevo de Plataformas no tenía existencia en Plataformas en el corte anterior y sí en el actual');
  near(Cp.A(1, last).q + 0, Cp.invU[last], 0, 'fuente Plataformas: total = Plataformas');
}

// 9a. Flujo fuera del inventario: el detalle guardado por estatus y tienda cuadra y no se mezcla con el inventario
{
  const ex = D.meta.excluido, gr = ex.grupos;
  ok(gr.en_camino.length === 3 && gr.proceso_interno.length === 2, 'grupos: 3 estatus en camino y 2 de proceso interno');
  for (const di of [last, last - 1]) {
    const f = D.dates[di];
    for (const est of ex.estatus) {
      const x = ex.por_estatus[est][f]; if (!x) continue;
      ok(Object.values(x.t).reduce((a2, y) => a2 + y.q, 0) === x.q, est + ' ' + f + ': el detalle por tienda suma el total');
    }
    near(ex.estatus.reduce((a2, est) => a2 + (ex.por_estatus[est][f] ? ex.por_estatus[est][f].q : 0), 0), ex.por_corte[f].q, 0, 'total fuera del inventario ' + f + ' = suma de sus estatus');
  }
}

// 9b. Los SKU de la advertencia (sin ningún cambio en todo el periodo) = la tarjeta "Sin cambios en todo el periodo"
for (const mode of ['all', 'erp', 'plat']) {
  const Cm = E.compute({ ...base(), mode }), L = E.lowRot(Cm), N = E.noMov(Cm), nunca = L.list.filter(r => r.never);
  ok(nunca.length === N.b[3].n && Math.abs(nunca.reduce((a2, r) => a2 + r.v, 0) - N.b[3].v) < 0.5, mode + ': SKU y valor detenido de la advertencia = tarjeta sin cambios en todo el periodo (' + nunca.length + ')');
}

// 9. La advertencia cuadra con "Inventario sin movimiento": misma población y mismos rangos de días
for (const mode of ['all', 'erp', 'plat']) {
  const Cm = E.compute({ ...base(), mode }), L = E.lowRot(Cm), N = E.noMov(Cm);
  ok(L.list.length === N.tot.n, mode + ': la advertencia lista los mismos SKU que "sin movimiento" (' + L.list.length + ')');
  ok(L.bk.every((n, i) => n === N.b[i].n), mode + ': SKU por rango de días iguales en ambas secciones', L.bk.join('/') + ' vs ' + N.b.map(x => x.n).join('/'));
  ok(L.bv.every((v, i) => Math.abs(v - N.b[i].v) < 0.5), mode + ': valor por rango de días igual en ambas secciones');
  near(L.vS + L.vO, N.tot.v, 0.5, mode + ': valor detenido + valor con rotación normal = valor total con existencia');
  ok(L.nZ + L.nL + L.nO === L.list.length, mode + ': sin salidas + baja rotación + rotación normal = todos los SKU');
}

{ // buscar un SKU filtra todo: total, disponible, reservado, mermas y venta plataforma salen solo de ese SKU
  const sk = D.skus[D.inv2.find(r => r[0] === 0 && D.dims.u[r[4]] === 'Venta Mermas')[5]];
  const Sq = { ...base(), mode: 'erp', q: sk }, Cq = E.compute(Sq), cq = E.summary(Sq, Cq).cur, last = D.dates.length - 1;
  const si = new Set(D.skus.map((s, i) => D.low[i].indexOf(sk.toLowerCase()) >= 0 ? i : -1).filter(i => i >= 0));
  const suma = name => { const ix = D.dims.src.indexOf(name); return D.inv2.filter(r => r[0] === ix && si.has(r[5])).reduce((s2, r) => s2 + r[7 + last], 0); };
  ok(cq.tot.q === suma('ERP') && cq.tot.q < E.summary({ ...base(), mode: 'erp' }, E.compute({ ...base(), mode: 'erp' })).cur.tot.q, 'SKU ' + sk + ': el total ERP solo cuenta ese SKU', cq.tot.q);
  ok(cq.mer.q === suma('ERP · Mermas') && cq.mer.q > 0, 'SKU ' + sk + ': tarjeta Mermas filtrada por SKU', cq.mer.q);
  ok(cq.vplat.q === suma('ERP · Venta plataforma') && cq.com.q === suma('ERP · Reservado') && cq.venErp.q === suma('ERP · Disponible'), 'SKU ' + sk + ': Venta plataforma, Reservado y Disponible filtrados por SKU');
}

console.log(fails ? `\n${fails} de ${n} verificaciones fallaron` : `OK: ${n} verificaciones del motor`);
process.exit(fails ? 1 : 0);
