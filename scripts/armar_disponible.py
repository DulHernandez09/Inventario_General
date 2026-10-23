"""Une los 4 archivos DISPONIBLE del ERP (uno por empresa) en un solo Excel con las columnas que lee generar_datos.py.

Uso: py armar_disponible.py <carpeta_mes_ERP> <AAAA-MM-DD[,AAAA-MM-DD...]> <salida.xlsx>   (varias fechas separadas por coma = varios cortes de disponible)
Reservado = Total comprometido (Asignado + Reservado + Autorizado).
La fecha del corte es la del nombre del archivo (21_OCT_2026_...), no la columna Fecha del reporte.
"""
import glob
import sys

import pandas as pd

carpeta, fecha, salida = sys.argv[1:4]
# empresa -> (tienda, almacén) según el ERP; mismos nombres que el concentrado
EMPRESAS = {
    "BHBE": ("BHBE", "IZTAPALAPA"),
    "MEDICAL": ("MEDICAL STORE", "TEPOTZOTLAN 4"),
    "NEXU": ("NEXU STORE", "TEPOTZOTLAN 3"),
    "SELECT": ("SELECTSHOP", "TEPOTZOTLAN 2"),
}
partes = []
for fecha_i in [f.strip() for f in fecha.split(',')]:
  dd = pd.to_datetime(fecha_i)
  for emp, (tienda, almacen) in EMPRESAS.items():
      ruta = glob.glob(f"{carpeta}\\{emp}\\{dd:%d}_{['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][dd.month-1]}_{dd:%Y}_{emp} DISPONIBLE.xlsx")
      if not ruta:
          print(f"Sin archivo DISPONIBLE para {emp} en {fecha_i}")
          continue
      x = pd.read_excel(ruta[0], header=None, skiprows=2)  # fila 0 = encabezados, fila 1 = subencabezados
      x = x[x[1].notna()]
      partes.append(pd.DataFrame({
          "Fecha": dd, "Tienda": tienda, "Almacen": almacen,
          "Categoria": x[3].astype(str), "Ubicacion": "General",
          "SKU CORRECTO": x[1].astype(str).str.strip(), "Titulo": x[2].fillna("").astype(str),
          "Disponible para la venta": pd.to_numeric(x[9], errors="coerce").fillna(0),
          "Reservado": sum(pd.to_numeric(x[c], errors="coerce").fillna(0) for c in (11, 12, 13)),
          "Costo": pd.to_numeric(x[7], errors="coerce"),
      }))
      print(f"{fecha_i} {emp}: {len(x):,} filas")
out = pd.concat(partes, ignore_index=True)
out.to_excel(salida, index=False)
print(f"Total {len(out):,} filas · disponible {out['Disponible para la venta'].sum():,.0f} · reservado {out['Reservado'].sum():,.0f}")

