// Pruebas de la concentración de valor (E.valor / concentracion / validar / ficha).   Uso: node tests/test_valor.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data', 'dashboard_data.js'), 'utf8'), ctx);
const D = ctx.window.DASHBOARD_DATA, E = require(path.join(root, 'js', 'engine.js')).create(D);
let fails = 0, n = 0;
const ok = (c, m, x) => { n++; if (!c) { fails++; console.log('  FALLA  ' + m + (x !== undefined ? '  → ' + x : '')); } };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, m, a + ' vs ' + b);
const last = D.dates.length - 1;

// 1. total de referencia = Resumen ejecutivo (ERP + Plataformas aptas y no aptas) + lo que el resumen deja fuera (en camino, en revisión, extraviadas): aquí se cuenta todo Plataformas
const base = { mode: 'all', et: 't', ch: -1, ts: [], cs: [], us: [], q: '', ds: [last], sort: 'total', lrB: 'all' };
const sum = E.summary(base, E.compute(base)).cur;
const V = E.valor(last, {});
const exc = D.meta.excluido.por_corte[D.dates[last]];
near(V.ref.v, sum.tot.v + exc.v, 0.05, 'Total de referencia = resumen ejecutivo + estatus de Plataformas que el resumen no cuenta');
ok(V.ref.q === sum.tot.q + exc.q, 'Piezas de referencia = resumen ejecutivo + estatus fuera del resumen', V.ref.q + ' vs ' + (sum.tot.q + exc.q));
const iFu = D.dims.src.indexOf('PLATAFORMAS · Fuera del inventario');
ok(iFu > 1, 'existe la fuente con los estatus de Plataformas que el resumen no cuenta');
const stF = D.dims.u, canalExtr = D.st.filter(r => r[0] === iFu && r[5] === last && stF[r[4]] === 'Extraviadas (en búsqueda)').reduce((a, r) => a + r[6], 0);
ok(canalExtr > 0, 'las extraviadas están dentro del total de Plataformas', canalExtr);
ok(V.avgPzs > 0 && V.nSku > 0 && Math.abs(V.avgPzs * V.nSku - V.ref.q) < 1e-6, 'Piezas promedio por SKU = piezas ÷ SKU con existencia', V.avgPzs);

// 2. todos los niveles concilian contra el total sin forzar la diferencia
V.rec.forEach(r => near(r.dif, 0, 0.05, 'Conciliación (solo centavos de redondeo) "' + r.n + '" cierra'));
ok(V.rec.every(r => r.ok), 'Todas las conciliaciones se muestran como conciliadas');
ok(V.skuQ === V.ref.q, 'Piezas: suma de SKU = total', V.skuQ + ' vs ' + V.ref.q);

// 3. el porcentaje acumulado de almacenes + canales termina en el 100 % del total
const cumAll = (V.alm.length ? V.alm[V.alm.length - 1].cum : 0) + (V.can.length ? V.can[V.can.length - 1].cum : 0);
near(cumAll, V.ref.v, 0.005, 'Almacenes (ERP) + canales (Plataformas) suman el 100 % del total');
ok(V.alm.every(a => D.dims.ch[a.ch]) && V.can.every(a => D.dims.ch[a.ch]), 'Cada almacén/canal tiene nombre');
ok(V.alm.every((x, i) => i === 0 || V.alm[i - 1].v >= x.v), 'Almacenes ordenados de mayor a menor valor');
ok(V.skus.every((x, i) => i === 0 || V.skus[i - 1].v >= x.v), 'SKU ordenados de mayor a menor valor');

// 4. cada almacén / canal: sus categorías y SKU suman exactamente su valor
[...V.alm, ...V.can].forEach(a => {
  const f = E.valor(last, { fuente: V.alm.includes(a) ? 0 : 1, ch: a.ch });
  near(f.sel.v, a.v, 0.005, D.dims.ch[a.ch] + ': selección = fila del ranking');
  f.rec.slice(2).forEach(r => near(r.dif, 0, 0.05, D.dims.ch[a.ch] + ': ' + r.n + ' cierra'));
  ok(f.skus.every(s => s.rows.every(r => r.ch === a.ch)), D.dims.ch[a.ch] + ': el detalle por SKU solo trae ese almacén/canal');
});

// 5. categoría dentro de un almacén
const a0 = V.alm[0], f1 = E.valor(last, { fuente: 0, ch: a0.ch }), c0 = f1.cats[0], f2 = E.valor(last, { fuente: 0, ch: a0.ch, c: c0.c });
near(f2.skuV, c0.v, 0.05, 'Categoría ' + D.dims.c[c0.c] + ' en ' + D.dims.ch[a0.ch] + ': SKU suman su valor');
ok(f2.skus.every(s => s.c === c0.c), 'El detalle por SKU solo trae la categoría elegida');
ok(f2.ref.v === V.ref.v, 'El total de referencia no cambia al filtrar');

// 6. concentración acumulada
const C = E.concentracion(V.skus, V.ref.v);
ok(C.top10 > 0 && C.top10 <= C.top20 && C.top20 <= 1, 'Top 10 ≤ Top 20 ≤ 100 %', C.top10 + ' / ' + C.top20);
let acc = 0; V.skus.slice(0, 10).forEach(s => acc += s.v);
near(C.top10, acc / V.ref.v, 1e-9, 'Top 10 SKU = suma de sus valores / total');
let acc80 = 0, k80 = 0; for (const s of V.skus) { acc80 += s.v; k80++; if (acc80 / V.ref.v >= 0.8) break; }
ok(C.n80 === k80, 'SKU que explican el 80 % del valor', C.n80 + ' vs ' + k80);
const Cs = E.concentracion(V.skus.slice(0, 3), V.skus.slice(0, 3).reduce((a, s) => a + s.v, 0));
ok(Cs.shown10 === 3 && Math.abs(Cs.top10 - 1) < 1e-9, 'Con menos de 10 registros se muestran los disponibles');
ok(E.concentracion([], 0).n === 0, 'Sin registros no inventa porcentajes');

// 7. validaciones y ficha
const Val = E.validar(last, V);
ok(Val.sinCosto.rows.every(r => !(r.cu > 0)) && Val.sinCosto.n === Val.sinCosto.rows.length, 'Alerta SKU sin costo trae solo esos registros', Val.sinCosto.n);
ok(Val.diferencias.n === 0, 'Sin diferencias de conciliación');
const sk = V.skus[0], fi = E.ficha(last, sk.k);
near(fi.v, V.skus.filter(s => s.k === sk.k).reduce((a, s) => a + s.v, 0), 0.05, 'Ficha del SKU líder = su valor en la tabla');

// 8. variación contra el corte anterior solo si existe
ok(E.valor(0, {}).prev === null && E.valor(last, {}).prev && E.valor(last, {}).prev.v > 0, 'Variación solo con corte anterior comparable');

// 9. piezas promedio = promedio de las piezas totales de los cortes hasta el seleccionado
const SR = E.serie(last);
ok(SR.n === D.dates.length && SR.cortes[last].q === V.ref.q, 'Serie: último corte = total de referencia', SR.cortes[last].q + ' vs ' + V.ref.q);
near(SR.avgQ, SR.cortes.reduce((a, x) => a + x.q, 0) / SR.n, 1e-6, 'Piezas promedio = suma de piezas de los cortes ÷ número de cortes');
ok(E.serie(0).n === 1 && E.serie(0).avgQ === E.serie(0).cortes[0].q, 'Con un solo corte el promedio es ese corte');

// 10. tendencia: último punto = total de referencia; con filtros, = la selección
const TR = E.tendencia({});
ok(TR.length === D.dates.length && Math.abs(TR[last].v - V.ref.v) < 0.005 && TR[last].q === V.ref.q, 'Tendencia: el último corte coincide con el total de referencia');
const selA = E.valor(last, { fuente: 0, ch: a0.ch }), TA = E.tendencia({ fuente: 0, ch: a0.ch });
ok(Math.abs(TA[last].v - selA.sel.v) < 0.005 && TA[last].q === selA.sel.q, 'Tendencia con almacén seleccionado = valor de ese almacén');
const TC = E.tendencia({ fuente: 0, ch: a0.ch, c: c0.c });
ok(Math.abs(TC[last].v - c0.v) < 0.005, 'Tendencia con categoría seleccionada = valor de esa categoría');
ok(TR.every((x, i) => i === 0 || x.di === TR[i - 1].di + 1), 'Tendencia: un punto por corte, en orden');

// 11. ficha: total y "para la venta" = ERP disponible + Plataformas aptas (ejemplo Z-EM18C11 del 23-oct: 9 + 2 = 11 de 14)
const fz = E.ficha(last, D.skus.indexOf('Z-EM18C11'));
ok(fz.q === 14 && fz.venta.erp.q === 9 && fz.venta.plat.q === 2 && fz.venta.q === 11, 'Z-EM18C11: 14 en total, 11 para la venta (ERP disponible 9 + Plataformas 2)', fz.q + ' / ' + fz.venta.q);
ok(fz.venta.v > 0 && fz.venta.v < fz.v, 'El valor para la venta es menor al valor total del SKU');
ok(V.skus.slice(0, 20).every(s => { const x = E.ficha(last, s.k); return x.venta.q === (x.venta.tieneD ? x.venta.erp.q : 0) + x.venta.plat.q && x.venta.q <= x.q + (x.venta.erp.q || 0); }), 'Para la venta = disponible ERP + aptas de Plataformas en los 20 SKU de mayor valor');

// 12. filtros globales (fuente y tienda) y compañías
const VE = E.valor(last, {}, { fuente: 0 }), VP = E.valor(last, {}, { fuente: 1 });
near(VE.ref.v + VP.ref.v, V.ref.v, 0.05, 'ERP + Plataformas = total de referencia');
ok(VE.can.length === 0 && VP.alm.length === 0, 'Con fuente ERP no hay canales; con Plataformas no hay almacenes');
VE.rec.concat(VP.rec).forEach(r => near(r.dif, 0, 0.05, 'Con filtro de fuente, la conciliación "' + r.n + '" cierra'));
const tn = E.tiendas(last, -1), tsum = tn.reduce((a, x) => a + x.v, 0);
near(tsum, V.ref.v, 0.05, 'Las tiendas suman el total de referencia');
const T0 = tn[0], VT = E.valor(last, {}, { t: T0.t });
near(VT.ref.v, T0.v, 0.005, 'Filtro de tienda ' + T0.name + ': el total es el de esa tienda');
VT.rec.forEach(r => near(r.dif, 0, 0.05, 'Con filtro de tienda, la conciliación "' + r.n + '" cierra'));
ok(VT.skus.every(s => s.rows.every(r => r.t === T0.t)), 'Con filtro de tienda, el detalle por SKU solo trae esa tienda');
const VTP = E.valor(last, {}, { fuente: 1, t: T0.t }), TT = E.tendencia({}, { fuente: 1, t: T0.t });
near(TT[last].v, VTP.ref.v, 0.005, 'La tendencia con filtros termina en el total del universo filtrado');
const SRu = E.serie(last, { fuente: 0 }); ok(SRu.cortes[last].q === VE.ref.q, 'Piezas promedio: la serie respeta el filtro de fuente');
const cs = V.cias.reduce((a, x) => a + x.v, 0); near(cs, V.ref.v, 0.005, 'Las compañías suman el total de referencia');
ok(V.cias.some(c => c.n === 'Select Shop') && V.cias.some(c => c.n === 'Bloom & Blush'), 'Existen Select Shop y Bloom & Blush');
ok(V.cias.every((c, i) => i === 0 || V.cias[i - 1].v >= c.v), 'Compañías ordenadas de mayor a menor valor');
const VCa = E.valor(last, { fuente: 0, ch: V.alm.find(a => D.dims.ch[a.ch] === 'TEPOTZOTLAN 3').ch }, {});
ok(VCa.cias.length === 1 && VCa.cias[0].n === 'Bloom & Blush', 'Tepotzotlán 3 (ERP) pertenece a Bloom & Blush');

// 13. desglose por compañía: almacenes (ERP) y tiendas (Plataformas) suman el valor de la compañía
V.cias.forEach(c => { near(c.det.reduce((a, d) => a + d.v, 0), c.v, 0.005, 'Desglose de ' + c.n + ' suma su valor'); ok(c.det.every((d, i) => i === 0 || c.det[i - 1].v >= d.v), 'Desglose de ' + c.n + ' ordenado por valor'); });
const sc = V.cias.find(c => c.n === 'Sin compañía'); ok(sc && sc.det.some(d => d.nombre === 'MX LOVERS' && d.fuente === 'Plataformas'), 'Sin compañía muestra la tienda MX LOVERS');

// 14. cada tienda de Plataformas dentro de su grupo trae su razón social (la tienda SELECTSHOP tiene dos: JSB y Selectshop MB)
const ss = V.cias.find(c => c.n === 'Select Shop');
ok(ss.det.filter(d => d.fuente === 'Plataformas').every(d => d.razon && d.razon !== 'Sin razón social'), 'Las tiendas de Plataformas traen razón social');
const sel2 = ss.det.filter(d => d.nombre === 'SELECTSHOP' && d.fuente === 'Plataformas').map(d => d.razon).sort();
ok(sel2.length === 2 && sel2[0] === 'Comercializadora de Marcas JSB' && sel2[1] === 'Selectshop MB', 'SELECTSHOP aparece con sus dos razones sociales', sel2.join(' / '));
const med = ss.det.find(d => d.nombre === 'SELECTSHOP (MEDICAL)'); ok(med && med.razon === 'Selectshop MB', 'SELECTSHOP (MEDICAL) pertenece a Selectshop MB');
// 15. desglose desplegable: ubicaciones (ERP) y estatus (Plataformas) suman el valor del almacén / canal
V.alm.forEach(x => { const d = E.desglose(last, x.ch, 0, {}); near(d.reduce((a, r) => a + r.v, 0), x.v, 0.005, 'Ubicaciones de ' + D.dims.ch[x.ch] + ' suman el almacén'); near(d.reduce((a, r) => a + r.q, 0), x.q, 0.5, 'Piezas por ubicación de ' + D.dims.ch[x.ch]); });
V.can.forEach(x => { const d = E.desglose(last, x.ch, 1, {}); near(d.reduce((a, r) => a + r.v, 0), x.v, 0.005, 'Estatus de ' + D.dims.ch[x.ch] + ' suman el canal'); });

// 16. movimientos entre cortes: entradas y salidas cuadran contra los datos crudos y el corte con más movimiento es el máximo
const MV = E.movimientos(last, {}, {});
let rE = 0, rS = 0, rVE = 0, rVS = 0; D.mv.forEach(r => { if (r[0] > 1 || r[6] < 1 || r[6] > last) return; if (r[7] > 0) { rE += r[7]; rVE += r[8]; } else { rS -= r[7]; rVS -= r[8]; } });
ok(MV.tot.e === rE && MV.tot.s === rS, 'Piezas de entradas y salidas = suma de los movimientos', MV.tot.e + '/' + MV.tot.s + ' vs ' + rE + '/' + rS);
near(MV.tot.ve, rVE, 0.5, 'Valor de entradas'); near(MV.tot.vs, rVS, 0.5, 'Valor de salidas');
near(MV.cuts.reduce((a, c) => a + c.ve, 0), MV.tot.ve, 0.5, 'Entradas por corte suman el total');
ok(MV.cuts.length === last, 'Un movimiento por cada par de cortes consecutivos');
ok(MV.cuts.every(c => MV.peak.mov >= c.mov), 'El corte pico es el de mayor valor movido');
ok(MV.cuts.every(c => c.iq <= Math.min(c.e, c.s) + 1e-9), 'Traspasos internos no superan entradas ni salidas');
ok(MV.top4.length === 4 && MV.top4.every((s, i) => i === 0 || MV.top4[i - 1].mov >= s.mov), 'Top 4 SKU ordenado por valor movido');
const skuMov = {}; D.mv.forEach(r => { if (r[0] <= 1 && r[6] >= 1) skuMov[r[5]] = (skuMov[r[5]] || 0) + Math.abs(r[8]); });
const best = Object.keys(skuMov).sort((a, b) => skuMov[b] - skuMov[a])[0];
ok(MV.top4[0].k === +best, 'El SKU #1 es el de mayor valor movido', D.skus[MV.top4[0].k] + ' vs ' + D.skus[best]);
const pkSum = MV.peak.ch.reduce((a, x) => a + x.ve + x.vs, 0); near(pkSum, MV.peak.mov, 0.5, 'Lugares del corte pico suman su valor movido');
// SKU sin movimiento = con existencia al corte y sin ningún movimiento
const SMv = E.sinMov(last, {}, {}), movedSet = new Set(); D.mv.forEach(r => { if (r[0] <= 1 && r[6] >= 1) movedSet.add(r[5]); });
const exist = {}; D.inv2.forEach(r => { if (r[0] <= 1 && r[7 + last]) { const a = exist[r[5]] || (exist[r[5]] = { q: 0, v: 0 }); a.q += r[7 + last]; a.v += r[7 + last] * r[6]; } });
const dead = Object.keys(exist).filter(k => !movedSet.has(+k));
ok(SMv.tot.n === dead.length && SMv.skus.length === dead.length, 'SKU sin movimiento = existencia sin ningún movimiento', SMv.tot.n + ' vs ' + dead.length);
near(SMv.tot.v, dead.reduce((a, k) => a + exist[k].v, 0), 0.5, 'Valor sin movimiento');
near(SMv.ch.reduce((a, x) => a + x.v, 0), SMv.tot.v, 0.5, 'Valor sin movimiento por lugar suma el total');
near(SMv.cat.reduce((a, x) => a + x.v, 0), SMv.tot.v, 0.5, 'Valor sin movimiento por categoría suma el total');
ok(SMv.skus.every(s => !movedSet.has(s.k)), 'Ningún SKU de la advertencia tiene movimientos');
ok(!E.movimientos(0, {}, {}).ok, 'El primer corte no tiene movimientos que medir');

// 17. filtros de varias opciones: elegir varios = sumar cada uno por separado
const chsAll = V.alm.concat(V.can).slice(0, 3).map(x => x.ch);
near(E.valor(last, { ch: chsAll }, {}).sel.v, chsAll.reduce((s, c) => s + E.valor(last, { ch: c }, {}).sel.v, 0), 0.01, 'Varios almacenes/canales: la selección suma cada uno');
const tsAll = E.tiendas(last, -1).slice(0, 3).map(x => x.t);
near(E.valor(last, {}, { t: tsAll }).ref.v, tsAll.reduce((s, x) => s + E.valor(last, {}, { t: x }).ref.v, 0), 0.01, 'Varias tiendas: el universo suma cada una');
near(E.movimientos(last, { ch: chsAll }, {}).tot.ve, chsAll.reduce((s, c) => s + E.movimientos(last, { ch: c }, {}).tot.ve, 0), 0.01, 'Movimientos con varios lugares suman cada uno');
ok(E.valor(last, { ch: [] }, { t: [] }).ref.v === V.ref.v, 'Lista vacía = sin filtro');
// 18. movimientos de un SKU
const t4 = MV.top4[0], MS = E.movSku(t4.k, last, {}, {});
near(MS.tot.ve, t4.ve, 0.01, 'Entradas del SKU en su ficha = Top 4'); near(MS.tot.vs, t4.vs, 0.01, 'Salidas del SKU en su ficha = Top 4'); ok(MS.tot.e === t4.e && MS.tot.s === t4.s, 'Piezas movidas del SKU en su ficha = Top 4');
let exq = 0; D.inv2.forEach(r => { if (r[5] === t4.k && r[0] <= 1) exq += r[7 + last]; }); ok(MS.q === exq, 'Existencia del SKU al corte', MS.q + ' vs ' + exq);
ok(MS.cuts.length === last + 1, 'Una fila por corte');
const quiet = SMv.skus[0], MQ = E.movSku(quiet.k, last, {}, {});
ok(MQ.mov === 0 && MQ.ult == null && MQ.q === quiet.q, 'SKU sin movimiento: ficha sin movimientos y misma existencia', MQ.q + ' vs ' + quiet.q);

// 19. varios cortes elegidos: se analizan solo esos cortes (cada uno contra su corte anterior)
const pick = [2, 5, last], MP = E.movimientos(pick, {}, {});
ok(MP.cuts.length === 3 && MP.cuts.map(c => c.di).join() === pick.join(), 'Solo los cortes elegidos entran al análisis');
near(MP.tot.ve, pick.reduce((s, k) => s + E.movimientos([k], {}, {}).tot.ve, 0), 0.01, 'Entradas de varios cortes = suma de cada corte');
near(MP.cuts.reduce((a, c) => a + c.mov, 0), MP.tot.ve + MP.tot.vs, 0.01, 'Valor movido por corte suma el total');
const SP = E.sinMov(pick, {}, {}); ok(SP.tot.n >= SMv.tot.n, 'Con menos cortes hay igual o más SKU sin movimiento', SP.tot.n + ' vs ' + SMv.tot.n);
ok(E.movimientos([0], {}, {}).ok === false && E.movimientos([last, last], {}, {}).cuts.length === 1, 'Cortes repetidos o solo el primero');
const MSp = E.movSku(MV.top4[0].k, pick, {}, {}); ok(MSp.cuts.length === 3 && MSp.q === MS.cuts[last].q, 'Ficha del SKU con varios cortes', MSp.q);

console.log(fails ? `\n${fails} de ${n} verificaciones fallaron` : `OK: ${n} verificaciones de la concentración de valor`);
process.exit(fails ? 1 : 0);
