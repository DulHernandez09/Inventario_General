# Inventario General · selectshop

Dashboard de inventario (ERP + Plataformas, piezas y valor a costo) en una sola página: `index_valor.html`
(`index.html` solo redirige a ella, así la raíz de GitHub Pages abre el dashboard).

**Pestañas**
- **Inventario:** valor total, tendencia, concentración por almacén/canal (con ubicaciones y estatus desplegables), por razón social, por categoría y por SKU, y conciliación.
- **Movimientos y advertencias:** entradas y salidas por corte, corte con más movimiento, Top 4 SKU con más movimiento e inventario sin movimiento.

**Filtros:** fecha de corte, fuente, canal/almacén y tienda; todos admiten varias opciones.

Se abre con doble clic (no necesita servidor). Enlaces directos: `?vista=mov`, `?cortes=2,5,8`, `?fuente=erp`, `?ch=MERCADO LIBRE,AMAZON`, `?tienda=SELECTSHOP`, `?sku=CODIGO`.

## Cómo está armado

```
scripts/generar_datos.py   Concentrados de Excel → data/dashboard_data.js (única fuente de números)
js/engine.js               Motor de cálculo sin DOM (valores, concentración, movimientos, SKU sin movimiento)
css/valor.css · assets/    Estilos y logo con los colores de selectshop.com.mx
tests/                     test_engine.js · test_valor.js · test_datos.py
```

Pruebas: `node tests/test_engine.js` y `node tests/test_valor.js`.

## Actualizar con un corte nuevo

```powershell
py scripts\generar_datos.py <concentrado_PLATAFORMAS.xlsx> <concentrado_ERP.xlsx> <disponible.xlsx>
node tests\test_valor.js
```

Los Excel originales nunca se modifican: los scripts solo los leen (si Excel los tiene abiertos, trabaja con una copia).
