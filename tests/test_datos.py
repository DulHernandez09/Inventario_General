"""
Conciliación de data/dashboard_data.json contra los concentrados originales (solo lectura).

Uso: py tests/test_datos.py <Concentrado_PLATAFORMAS.xlsx> <Concentrado_ERP.xlsx> [<disponible_armado.xlsx>]

Comprueba que lo que muestra el dashboard es exactamente lo que traen los archivos: piezas y valor por corte y por fuente,
disponible/reservado, y que ninguna fila se perdió ni se duplicó al transformar.
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
fails = 0
n = 0


def ok(cond, msg, extra=""):
    global fails, n
    n += 1
    if not cond:
        fails += 1
        print(f"  FALLA  {msg}  {extra}")


def main(plat_path, erp_path, disp_path=None):
    d = json.loads((ROOT / "data" / "dashboard_data.json").read_text(encoding="utf-8"))
    dates = d["dates"]
    src = {s: i for i, s in enumerate(d["dims"]["src"])}
    p = pd.read_excel(plat_path)
    e = pd.read_excel(erp_path)
    excl = d.get("meta", {}).get("excluido", {}).get("estatus", [])
    ok(bool(excl), "el dashboard documenta los estatus que excluye del inventario", str(excl))
    por_est = d.get("meta", {}).get("excluido", {}).get("por_estatus", {})
    ult = dates[-1]
    for est in excl:   # lo excluido también se concilia contra el Excel, por estatus y tienda
        fuente = p[(p["Ubicación"].astype(str).str.strip() == est) & (p["Fecha"].astype(str).str[:10] == ult)]
        q_src, v_src = int(fuente["Total"].sum()), float(fuente["Costo Inventario"].sum())
        dd = por_est.get(est, {}).get(ult, {"q": 0, "v": 0, "t": {}})
        ok(q_src == dd["q"] and abs(v_src - dd["v"]) < 1.0, f"fuera del inventario · {est}: {q_src:,} pzs ${v_src:,.2f} = dashboard", f"({dd['q']:,} / ${dd['v']:,.2f})")
        ok(sum(x["q"] for x in dd.get("t", {}).values()) == dd["q"], f"{est}: el detalle por tienda suma el total")
        ok(sum(c["q"] for tt in dd.get("t", {}).values() for c in tt.get("c", {}).values()) == dd["q"], f"{est}: el detalle por canal suma el total")
    p = p[~p["Ubicación"].astype(str).str.strip().isin(excl)]   # mismo criterio que generar_datos.py
    for nombre, x, qcol, vcol in (("PLATAFORMAS", p, "Total", "Costo Inventario"), ("ERP", e, "Total", "Costo Inventario")):
        x["F"] = x["Fecha"].astype(str).str[:10]
        ok(sorted(x["F"].unique()) == dates, f"{nombre}: los cortes del dashboard son los del concentrado")
        for i, f in enumerate(dates):
            q = int(x[x["F"] == f][qcol].sum())
            v = float(x[x["F"] == f][vcol].sum())
            q2 = sum(r[6] for r in d["st"] if r[0] == src[nombre] and r[5] == i)
            v2 = sum(r[7] for r in d["st"] if r[0] == src[nombre] and r[5] == i)
            ok(q == q2, f"{nombre} {f}: piezas {q:,} = dashboard", f"({q2:,})")
            ok(abs(v - v2) < 1.0, f"{nombre} {f}: valor ${v:,.2f} = dashboard", f"(${v2:,.2f})")
        # el detalle por SKU (inv2) suma lo mismo que el agregado
        qi = sum(r[7 + len(dates) - 1] for r in d["inv2"] if r[0] == src[nombre])
        ok(qi == int(x[x["F"] == dates[-1]][qcol].sum()), f"{nombre}: detalle por SKU (inv2) = existencia del último corte", f"({qi:,})")
        ok(int((x[qcol] < 0).sum()) == 0, f"{nombre}: sin existencias negativas")
    if disp_path:
        x = pd.read_excel(disp_path)
        x["F"] = x["Fecha"].astype(str).str[:10]
        fechas_disp = sorted(x["F"].unique())
        for f in fechas_disp:   # un corte de disponible por fecha
            i = dates.index(f)
            for nombre, col in (("ERP · Disponible", "Disponible para la venta"), ("ERP · Reservado", "Reservado")):
                xf = x[x["F"] == f]
                if nombre == "ERP · Disponible":   # sin mermas ni venta plataforma (ubicaciones del concentrado ERP), nunca < 0
                    ex = e[(pd.to_datetime(e["Fecha"]).astype(str).str[:10] == f) & e["Ubicacion"].str.strip().str.lower().isin(["venta mermas", "venta deysa", "venta mxlovers", "venta xitelly", "venta outlet"])]
                    ex = ex.assign(T=ex["Tienda"].str.strip(), S=ex["SKU CORRECTO"].astype(str).str.strip()).groupby(["T", "S"])["Total"].sum()
                    xs = xf.assign(T=xf["Tienda"].str.strip(), S=xf["SKU CORRECTO"].astype(str).str.strip()).groupby(["T", "S"])[col].sum()
                    q = int(sum(max(v_ - ex.get(k_, 0), 0) for k_, v_ in xs.items()))   # por tienda+SKU, nunca < 0
                else:
                    q = int(xf[col].sum())
                q2 = sum(r[6] for r in d["st"] if r[0] == src[nombre] and r[5] == i)
                ok(q == q2, f"{nombre} {f}: {q:,} piezas = dashboard (disponible sin mermas ni venta plataforma)", f"({q2:,})")
        ok(d["has"][str(src["ERP · Disponible"])] == [dates.index(f) for f in fechas_disp], f"disponible solo existe en los cortes con archivo ({', '.join(fechas_disp)}); no se inventan otros")
    ok(not any("#N" in t for t in d["tit"]), "ningún producto muestra #N/D como nombre")
    ok(all(len(r) == 7 + len(dates) for r in d["inv2"]), "cada fila de inv2 trae una cantidad por corte")
    print(f"OK: {n} verificaciones de datos" if not fails else f"\n{fails} de {n} verificaciones fallaron")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        sys.exit(2)
    main(*sys.argv[1:])
