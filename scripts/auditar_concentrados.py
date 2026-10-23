"""
Auditoría de los concentrados de inventario (solo lectura: no modifica ningún archivo original).

Uso:
    py scripts/auditar_concentrados.py <Concentrado_PLATAFORMAS.xlsx> <Concentrado_ERP.xlsx> [<carpeta_ERP_mes> <AAAA-MM-DD>]

El tercer y cuarto argumento son opcionales: carpeta del mes del ERP (con una subcarpeta por empresa y los
archivos "<dd>_<MES>_<AAAA>_<EMPRESA> DISPONIBLE.xlsx") y la fecha del corte de disponible.

Salida:
    data/auditoria.json   (lo lee el dashboard ejecutivo para mostrar la calidad de datos)
    informe en pantalla
"""
import glob
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]
EMPRESAS = {"BHBE": "BHBE", "MEDICAL": "MEDICAL STORE", "NEXU": "NEXU STORE", "SELECT": "SELECTSHOP"}


def resumen_fuente(nombre, x, canal, tit):
    """Estructura de un concentrado: columnas, cortes, catálogos y problemas de calidad."""
    t = x[tit].astype(str).str.strip()
    malos = x[t.str.startswith("#") | (t == "") | (t.str.lower() == "nan")]
    llave = ["Fecha", "Tienda", canal, x.columns[4 if nombre == "PLATAFORMAS" else 3], x.columns[7], "SKU CORRECTO"]
    ult = x["Fecha"].max()
    return {
        "filas": int(len(x)), "columnas": list(map(str, x.columns)),
        "cortes": [str(d)[:10] for d in sorted(x["Fecha"].unique())],
        "skus": int(x["SKU CORRECTO"].nunique()), "tiendas": sorted(map(str, x["Tienda"].dropna().unique())),
        "canales_o_almacenes": sorted(map(str, x[canal].dropna().unique())),
        "ubicaciones_o_estatus": sorted(map(str, x[x.columns[7]].dropna().unique())),
        "nulos": {str(k): int(v) for k, v in x.isna().sum().items() if v},
        "titulos_con_error": int(len(malos)), "skus_titulo_error": sorted(map(str, malos["SKU CORRECTO"].unique()))[:20],
        "total_negativo": int((x["Total"] < 0).sum()), "costo_cero_con_existencia": int(((x["Costo"] <= 0) & (x["Total"] > 0)).sum()),
        "filas_llave_repetida": int(x.duplicated(llave, keep=False).sum()),
        "filas_exactas_repetidas": int(x.duplicated(keep=False).sum()),
        "costo_inventario_no_cuadra": int(((x["Costo Inventario"] - x["Costo"] * x["Total"]).abs() > 0.05).sum()),
        "iva_no_es_116": int((((x["Costo Inventario + IVA"] / x["Costo Inventario"].replace(0, np.nan)).round(3) != 1.16) & (x["Costo Inventario"] > 0)).sum()),
        "skus_con_varios_costos_misma_fecha": int((x.groupby(["Fecha", "SKU CORRECTO"])["Costo"].nunique() > 1).sum()),
        "piezas_ultimo_corte": int(x[x["Fecha"] == ult]["Total"].sum()),
        "valor_ultimo_corte": round(float(x[x["Fecha"] == ult]["Costo Inventario"].sum()), 2),
        "copias_exactas_con_existencia_ultimo_corte": _copias(x, ult),
        "piezas_por_corte": {str(k)[:10]: int(v) for k, v in x.groupby("Fecha")["Total"].sum().items()},
    }


def _copias(x, ult):
    """Filas idénticas (todas las columnas) repetidas con existencia en el último corte: posible doble captura o series distintas."""
    u = x[(x["Fecha"] == ult) & (x["Total"] > 0)]
    c = u[u.duplicated(keep="first")]
    return {"filas": int(len(c)), "piezas": int(c["Total"].sum()), "valor": round(float(c["Costo Inventario"].sum()), 2),
            "nota": "No se eliminan: pueden ser lotes/series distintos del mismo SKU. Se reportan para que se confirme en el origen."}


def cargar_disponible(carpeta, fecha):
    dd = pd.to_datetime(fecha)
    partes = []
    for emp, tienda in EMPRESAS.items():
        r = glob.glob(f"{carpeta}\\{emp}\\{dd:%d}_{MESES[dd.month - 1]}_{dd:%Y}_{emp} DISPONIBLE.xlsx")
        if not r:
            continue
        x = pd.read_excel(r[0], header=None, skiprows=2)
        x = x[x[1].notna()]
        partes.append(pd.DataFrame({
            "Tienda": tienda, "SKU": x[1].astype(str).str.strip(),
            "Disponible": pd.to_numeric(x[9], errors="coerce").fillna(0),
            "Comprometido": sum(pd.to_numeric(x[c], errors="coerce").fillna(0) for c in (11, 12, 13)),
        }))
    return pd.concat(partes, ignore_index=True) if partes else None


def main(plat_path, erp_path, carpeta=None, fecha=None):
    p = pd.read_excel(plat_path)
    e = pd.read_excel(erp_path)
    A = {"PLATAFORMAS": resumen_fuente("PLATAFORMAS", p, "Plataforma", "Título"),
         "ERP": resumen_fuente("ERP", e, "Almacen", "Titulo")}

    # relación entre fuentes en el último corte
    ult = min(p["Fecha"].max(), e["Fecha"].max())
    pu, eu = p[p["Fecha"] == ult], e[e["Fecha"] == ult]
    sp, se = set(pu["SKU CORRECTO"]), set(eu["SKU CORRECTO"])
    por_tienda = pd.DataFrame({"ERP": eu.groupby("Tienda")["Total"].sum(), "PLATAFORMAS": pu.groupby("Tienda")["Total"].sum()}).fillna(0).astype(int)
    comunes = pu[pu["SKU CORRECTO"].isin(se)]
    A["relacion_erp_plataformas"] = {
        "corte": str(ult)[:10], "skus_solo_erp": len(se - sp), "skus_solo_plataformas": len(sp - se), "skus_en_ambas": len(se & sp),
        "piezas_plataformas_en_skus_tambien_erp": int(comunes["Total"].sum()),
        "piezas_por_tienda": {k: v for k, v in por_tienda.to_dict("index").items()},
        "nota": "Las dos fuentes son existencias distintas (almacenes ERP vs. inventario en plataformas); no se pueden cruzar pieza a pieza sin una llave física. El dashboard las muestra por separado y su suma solo en 'Todos'.",
    }

    # disponible / reservado frente al ERP total
    if carpeta and fecha:
        d = cargar_disponible(carpeta, fecha)
        if d is not None:
            tot = eu.groupby(["Tienda", "SKU CORRECTO"])["Total"].sum()
            dd = d.groupby(["Tienda", "SKU"]).agg(Disp=("Disponible", "sum"), Comp=("Comprometido", "sum"))
            dd.index.names = ["Tienda", "SKU CORRECTO"]
            j = dd.join(tot, how="left").fillna({"Total": 0})
            exceso = j[(j["Disp"] + j["Comp"]) > j["Total"] + 0.5]
            A["disponible"] = {
                "corte": fecha, "empresas_con_archivo": sorted(d["Tienda"].unique()), "empresas_sin_archivo": sorted(set(EMPRESAS.values()) - set(d["Tienda"])) + ["T-LAB"],
                "disponible": int(d["Disponible"].sum()), "comprometido": int(d["Comprometido"].sum()),
                "erp_total_mismas_tiendas": int(eu[eu["Tienda"].isin(d["Tienda"].unique())]["Total"].sum()),
                "skus_disp_mas_comprometido_mayor_que_erp_total": int(len(exceso)),
                "piezas_exceso": int((exceso["Disp"] + exceso["Comp"] - exceso["Total"]).sum()),
                "nota": "Disponible y comprometido son una clasificación del mismo stock del ERP (no se suman al total).",
            }

    A["indicadores"] = {
        "valor_total_y_piezas": "Calculable (Total, Costo Inventario por corte).",
        "variacion_vs_periodo_anterior": "Calculable entre cortes consecutivos de cada fuente.",
        "valor_vendible_no_vendible": "Plataformas: calculable por estatus ('Aptas para vender' = vendible). ERP: solo con los archivos DISPONIBLE (un corte, 4 de 5 empresas); no existe estatus de venta en el concentrado ERP.",
        "inventario_por_canal": "Calculable (columna Plataforma).",
        "inventario_por_almacen_y_ubicacion": "Calculable (columnas Almacen y Ubicacion del ERP).",
        "movimientos": "Calculable como variación de existencias entre cortes (no hay ventas ni compras en los concentrados).",
        "sin_movimiento": "Calculable con los cortes disponibles; la precisión depende de la frecuencia de cortes (hoy cada 1-4 días).",
        "no_disponible": ["Ventas / rotación real en unidades vendidas", "Precio de venta y margen", "Fecha de entrada del producto (antigüedad real)", "Disponible/reservado histórico (solo hay un corte)", "Disponible de T-LAB"],
    }
    (ROOT / "data").mkdir(exist_ok=True)
    txt = json.dumps(A, ensure_ascii=False, indent=1, default=str)
    (ROOT / "data" / "auditoria.json").write_text(txt, encoding="utf-8")
    (ROOT / "data" / "auditoria.js").write_text("window.AUDITORIA=" + txt + ";\n", encoding="utf-8")  # lo lee el dashboard ejecutivo
    print(json.dumps(A, ensure_ascii=False, indent=1, default=str))


if __name__ == "__main__":
    if len(sys.argv) not in (3, 5):
        print(__doc__)
        sys.exit(1)
    main(*sys.argv[1:])
