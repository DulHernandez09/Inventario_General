"""
Genera los datos del panel de inventario a partir de los concentrados de ERP y Plataformas.

Uso:
    python scripts/generar_datos.py <Concentrado_PLATAFORMAS.xlsx> <Concentrado_ERP.xlsx> [<Concentrado_ERP_Disponible.xlsx>]

El tercer archivo es opcional: concentrado del ERP con "Disponible para la venta" y "Reservado".
Si se incluye, el panel activa el botón secundario ERP → Total / Disponible para la venta / Reservado.
Columnas que se buscan (sin importar mayúsculas/acentos): Fecha, Tienda, Almacen, Categoria,
Ubicacion (opcional), SKU CORRECTO (o SKU), Titulo (opcional), Disponible, Reservado, Costo.

Salida:
    data/dashboard_data.js   (lo carga index_ejecutivo.html; funciona abriendo el archivo con doble clic)
    data/dashboard_data.json (misma información en JSON)

Cada archivo es una serie de "cortes" (fotos diarias del inventario). Un movimiento es la
variación de existencias de un SKU por tienda, plataforma/almacén, categoría y estatus
entre dos cortes consecutivos: aumento = entrada, disminución = salida.
"""
import json
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

# Inventario = ERP + Plataformas "ocupando espacio" (Aptas para vender y No aptas para vender).
# Lo que está EN CAMINO (Pendientes de ingreso, En transferencia, Devueltas por el comprador) y los procesos internos
# (En revisión, Extraviadas) NO cuentan como inventario (ni piezas ni valor): se guardan aparte en meta.excluido
# para mostrarlos como flujo.
EN_CAMINO = ["Pendientes de ingreso", "En transferencia", "Devueltas por el comprador"]
PROCESO_INTERNO = ["Extraviadas (en búsqueda)", "En revisión"]
EXCLUIR_ESTATUS = EN_CAMINO + PROCESO_INTERNO


def norm_cat(s):
    return s.astype(str).str.strip().str.lower().str.capitalize().str.replace("Cristaleria", "Cristalería")


def _n(x):
    x = unicodedata.normalize("NFKD", str(x)).encode("ascii", "ignore").decode().lower().strip()
    return " ".join(x.split())


def col(df, *cands, required=True):
    names = {_n(c): c for c in df.columns}
    for cand in cands:
        cn = _n(cand)
        if cn in names:
            return names[cn]
    for cand in cands:
        cn = _n(cand)
        for k, c in names.items():
            if cn in k:
                return c
    if required:
        raise KeyError(f"No se encontró la columna {cands[0]!r}. Columnas: {list(df.columns)}")
    return None


# Ubicaciones del ERP que no son venta normal: se quitan del "Disponible para la venta" y se muestran en tarjetas aparte
UB_MERMAS = ["Venta Mermas"]
UB_VENTA_PLATAFORMA = ["Venta Deysa", "Venta MxLovers", "Venta Xitelly"]
UB_OUTLET = ["Venta Outlet"]


def cargar_disponible(path):
    x = pd.read_excel(path)
    c_disp = col(x, "Disponible para la venta", "Disponible")
    c_res = col(x, "Reservado")
    c_cost = col(x, "Costo", "Costo unitario")
    c_ubi = col(x, "Ubicacion", required=False)
    c_tit = col(x, "Titulo", "Título", "Descripcion", required=False)
    base = {
        "f": pd.to_datetime(x[col(x, "Fecha")]),
        "ch": x[col(x, "Almacen", "Almacén")].astype(str).str.strip(),
        "t": x[col(x, "Tienda")].astype(str).str.strip(),
        "c": norm_cat(x[col(x, "Categoria", "Categoría")]),
        "u": (x[c_ubi].astype(str).str.strip().replace({"ACUMULADO": "Acumulado", "acumulado": "Acumulado"}) if c_ubi else "General"),
        "sku": x[col(x, "SKU CORRECTO", "SKU")].astype(str).str.strip(),
        "tit": x[c_tit].astype(str) if c_tit else "",
    }
    cost = pd.to_numeric(x[c_cost], errors="coerce").fillna(0)
    out = []
    for name, c in (("ERP · Disponible", c_disp), ("ERP · Reservado", c_res)):
        q = pd.to_numeric(x[c], errors="coerce").fillna(0)
        out.append(pd.DataFrame(dict(base, src=name, q=q, v=q * cost)))
    return pd.concat(out, ignore_index=True)


def cargar(plat_path, erp_path):
    p = pd.read_excel(plat_path)
    e = pd.read_excel(erp_path)
    p = pd.DataFrame({
        "f": p["Fecha"], "src": "PLATAFORMAS", "ch": p["Plataforma"].str.strip(), "t": p["Tienda"].str.strip(),
        "c": norm_cat(p["Categoría"]), "u": p["Ubicación"].str.strip(),
        "sku": p["SKU CORRECTO"].astype(str).str.strip(), "tit": p["Título"].astype(str),
        "q": p["Total"], "v": p["Costo Inventario"],
    })
    e = pd.DataFrame({
        "f": e["Fecha"], "src": "ERP", "ch": e["Almacen"].str.strip(), "t": e["Tienda"].str.strip(),
        "c": norm_cat(e["Categoria"]),
        "u": e["Ubicacion"].str.strip().replace({"ACUMULADO": "Acumulado", "acumulado": "Acumulado"}),
        "sku": e["SKU CORRECTO"].astype(str).str.strip(), "tit": e["Titulo"].astype(str),
        "q": e["Total"], "v": e["Costo Inventario"],
    })
    return pd.concat([p, e], ignore_index=True)


def main(plat_path, erp_path, disp_path=None):
    d = cargar(plat_path, erp_path)
    if disp_path:
        d = pd.concat([d, cargar_disponible(disp_path)], ignore_index=True)
    K = ["src", "ch", "t", "c", "u", "sku"]
    D = ["src", "ch", "t", "c", "u"]
    # groupby/pivot descartan las llaves vacías: se rellenan para no perder existencia
    vacias = int(d[["ch", "t", "c", "u", "sku"]].isna().any(axis=1).sum()) + int((d["c"] == "Nan").sum())
    for c_ in ("ch", "t", "c", "u", "sku"):
        d[c_] = d[c_].fillna("Sin dato").astype(str).replace({"Nan": "Sin dato", "nan": "Sin dato"})
    if vacias:
        print(f"Aviso: {vacias:,} filas con tienda/categoría/ubicación/SKU vacío se agruparon como 'Sin dato'")
    d["f"] = pd.to_datetime(d["f"])
    ub_l = d["u"].str.lower()
    e_mer = (d["src"] == "ERP") & ub_l.isin([x.lower() for x in UB_MERMAS])
    e_vp = (d["src"] == "ERP") & ub_l.isin([x.lower() for x in UB_VENTA_PLATAFORMA])
    e_out = (d["src"] == "ERP") & ub_l.isin([x.lower() for x in UB_OUTLET])
    ajuste = None
    if disp_path:
        # El archivo DISPONIBLE no distingue ubicación: se resta, por corte/almacén/tienda/SKU, lo que el concentrado ERP
        # tiene en mermas y venta plataforma (nunca por debajo de 0).
        ex = d[e_mer | e_vp | e_out].groupby(["f", "t", "sku"]).q.sum().rename("qx").reset_index()   # por tienda+SKU: el almacén del archivo DISPONIBLE no siempre coincide
        isd = d["src"] == "ERP · Disponible"
        dd = d.loc[isd, ["f", "t", "sku", "q", "v"]].copy()
        dd["qx"] = dd.merge(ex, on=["f", "t", "sku"], how="left")["qx"].fillna(0).values
        # lo que se resta se reparte en orden entre las filas del mismo corte/tienda/SKU (sin restar dos veces ni bajar de 0)
        antes = dd.groupby(["f", "t", "sku"]).q.cumsum() - dd["q"]
        quitar = np.clip(np.minimum(dd["q"].values, dd["qx"].values - antes.values), 0, None)
        nq = dd["q"].values - quitar
        ratio = np.where(dd["q"].values > 0, nq / np.where(dd["q"].values > 0, dd["q"].values, 1), 0)
        ajuste = {"antes": int(dd["q"].sum()), "restado": int(quitar.sum()), "coincidencias": int((quitar > 0).sum())}
        d.loc[isd, "q"] = nq
        d.loc[isd, "v"] = dd["v"].values * ratio
        print(f"Disponible sin mermas ni venta plataforma: {ajuste['antes']:,} -> {int(nq.sum()):,} pzs (restado {ajuste['restado']:,} en {ajuste['coincidencias']:,} filas)")
    d = pd.concat([d, d[e_mer].assign(src="ERP · Mermas"), d[e_vp].assign(src="ERP · Venta plataforma"), d[e_out].assign(src="ERP · Venta Outlet")], ignore_index=True)
    # estatus excluidos del inventario: se quitan aquí y se dejan documentados
    mask = (d["src"] == "PLATAFORMAS") & d["u"].isin(EXCLUIR_ESTATUS)
    excluido = {"estatus": EXCLUIR_ESTATUS, "grupos": {"en_camino": EN_CAMINO, "proceso_interno": PROCESO_INTERNO}, "por_corte": {}}
    for f_, x_ in d[mask].groupby("f"):
        excluido["por_corte"][str(f_)[:10]] = {"q": int(x_["q"].sum()), "v": round(float(x_["v"].sum()), 2)}
    # detalle por estatus, corte y tienda (para mostrar esas tarjetas aunque no cuenten como inventario)
    excluido["por_estatus"] = {}
    for est, xe in d[mask].groupby("u"):
        porf = {}
        for f_, xf in xe.groupby("f"):
            porf[str(f_)[:10]] = {"q": int(xf["q"].sum()), "v": round(float(xf["v"].sum()), 2),
                                  "t": {t_: {"q": int(x["q"].sum()), "v": round(float(x["v"].sum()), 2),
                                      "c": {c_: {"q": int(y["q"].sum()), "v": round(float(y["v"].sum()), 2)} for c_, y in x.groupby("ch")}} for t_, x in xf.groupby("t")}}
        excluido["por_estatus"][est] = porf
    if mask.any():
        print(f"Excluido del inventario ({', '.join(EXCLUIR_ESTATUS)}): {int(d[mask]['q'].sum()):,} pzs en {int(mask.sum()):,} filas (todos los cortes)")
    d = d[~mask].copy()
    g = d.groupby(K + ["f"]).agg(q=("q", "sum"), v=("v", "sum")).reset_index()
    fechas = sorted(g.f.unique())
    dates = [str(x)[:10] for x in fechas]

    # Movimientos entre cortes consecutivos
    w = g.pivot_table(index=K, columns="f", values="q", aggfunc="sum").fillna(0)
    wv = g.pivot_table(index=K, columns="f", values="v", aggfunc="sum").fillna(0)
    uc = (wv.sum(axis=1) / w.sum(axis=1).replace(0, np.nan)).fillna(0)
    rows = []
    cortes = g.groupby("src").f.apply(lambda s: set(s.unique())).to_dict()
    for i in range(1, len(fechas)):
        delta = w[fechas[i]] - w[fechas[i - 1]]
        for k, val in delta[delta != 0].items():
            # fuente sin corte previo (p. ej. Disponible/Reservado): no hay movimiento que medir
            if k[0] not in ("ERP", "PLATAFORMAS") or fechas[i - 1] not in cortes[k[0]]:
                continue   # solo ERP y Plataformas tienen movimiento; Disponible/Reservado/Mermas/Venta plataforma son otra clasificación del mismo stock
            rows.append(k + (i, val, val * uc[k]))
    m = pd.DataFrame(rows, columns=K + ["di", "dq", "dv"])

    dims = {k: sorted(set(m[k]) | set(g[k])) for k in D}
    # Orden fijo de fuentes: ERP=0, PLATAFORMAS=1, luego Disponible / Reservado
    extras = [x for x in ("ERP · Disponible", "ERP · Reservado", "ERP · Mermas", "ERP · Venta plataforma", "ERP · Venta Outlet") if x in dims["src"]]
    dims["src"] = ["ERP", "PLATAFORMAS"] + extras
    ix = {k: {v: i for i, v in enumerate(dims[k])} for k in D}
    # Título por SKU: el primero válido (se ignoran #N/D, vacíos y "nan" que deja una búsqueda fallida en el Excel)
    tt = d["tit"].astype(str).str.strip()
    tt = tt.where(~(tt.str.startswith("#") | tt.str.lower().isin(["", "nan", "none", "n/d"])))
    titulos = tt.groupby(d["sku"]).first().fillna("Sin nombre en el concentrado").to_dict()

    skus = sorted(m.sku.unique())
    skus += sorted(set(g.sku) - set(skus))
    si = {s: i for i, s in enumerate(skus)}

    mv = [[ix["src"][r.src], ix["ch"][r.ch], ix["t"][r.t], ix["c"][r.c], ix["u"][r.u], si[r.sku],
           int(r.di), int(r.dq), round(float(r.dv), 2)] for r in m.itertuples()]

    dmap = {x: i for i, x in enumerate(dates)}
    gs = g.groupby(D + ["f"]).agg(q=("q", "sum"), v=("v", "sum")).reset_index()
    st = [[ix["src"][r.src], ix["ch"][r.ch], ix["t"][r.t], ix["c"][r.c], ix["u"][r.u],
           dmap[str(r.f)[:10]], int(r.q), round(float(r.v), 2)] for r in gs.itertuples()]

    # Existencias por fuente, canal/almacén, tienda, categoría, ubicación/estatus y SKU en cada corte.
    # inv2 = [src, ch, t, c, u, sku, costoUnit, q_por_corte...]  (alimenta SKU nuevos, baja rotación, top productos y riesgos
    # respetando todos los filtros; las cifras agregadas del panel salen de "st", que es la misma información sumada)
    Q = w[fechas].values
    inv = []
    for idx, k in enumerate(w.index):
        qs = Q[idx]
        if qs.max() <= 0:
            continue
        inv.append([ix["src"][k[0]], ix["ch"][k[1]], ix["t"][k[2]], ix["c"][k[3]], ix["u"][k[4]], si[k[5]],
                    round(float(uc[k]), 4)] + [int(x) for x in qs])

    # Categoría principal de cada SKU (para filtrar nuevos SKU y baja rotación)
    cat_sku = d.groupby(["sku", "c"]).q.size().reset_index().sort_values("q", ascending=False).drop_duplicates("sku")
    cat_map = dict(zip(cat_sku.sku, cat_sku.c))
    skc = [ix["c"].get(cat_map.get(s_), -1) for s_ in skus]

    out = {"dates": dates, "dims": dims, "skus": skus, "tit": [titulos.get(s, "")[:80] for s in skus],
           "mv": mv, "st": st, "inv2": inv, "skc": skc,
           # clasificación de venta (definida aquí, en la capa de datos, no en la interfaz)
           "cfg": {"vendible_estatus_plataformas": ["Aptas para vender"],
                   # Plataformas: solo "aptas" y "no aptas" ocupan espacio y cuentan como inventario
                   "estatus_en_camino": EN_CAMINO, "estatus_ocupa_espacio": ["Aptas para vender", "No aptas para vender"],
                   "ubicaciones_fuera_de_disponible": {"mermas": UB_MERMAS, "venta_plataforma": UB_VENTA_PLATAFORMA, "outlet": UB_OUTLET},
                   "nota_vendible": "Vendible = Plataformas 'Aptas para vender' + ERP 'Disponible para la venta' (solo si hay archivo DISPONIBLE en ese corte). "
                                    "El resto de los estatus de Plataformas es no vendible. El ERP total no trae estatus de venta."},
           "meta": {"generado": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"), "cortes": len(dates),
                    "filas_origen": {s_: int(n_) for s_, n_ in d.groupby("src").size().items()}, "filas_llave_vacia": vacias,
                    "excluido": excluido},
           "has": {str(ix["src"][s_]): [i for i, x_ in enumerate(fechas) if x_ in c_] for s_, c_ in cortes.items()}}
    txt = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "dashboard_data.json").write_text(txt, encoding="utf-8")
    (ROOT / "data" / "dashboard_data.js").write_text("window.DASHBOARD_DATA=" + txt + ";\n", encoding="utf-8")
    print(f"Cortes: {', '.join(dates)}")
    print(f"Movimientos: {len(mv):,} · SKU: {len(skus):,} · filas de existencia (inv2): {len(inv):,}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        sys.exit(1)
    main(*sys.argv[1:])
