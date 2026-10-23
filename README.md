# Dashboard de inventario · selectshop

Tres vistas de la misma información (ERP + Plataformas, piezas y valor a costo), sobre un solo motor de cálculo.

| Archivo | Qué es |
|---|---|
| `index_ejecutivo.html` | **Propuesta 2 · Dashboard Inventario General**. Con Fuente = Todos solo muestra *Resumen ejecutivo*; con ERP añade *Inventario por almacén* y *Movimientos y riesgos*; con Plataformas añade *Inventario por canal* y *Movimientos y riesgos*. Filtros: fechas, fuente, plataforma, tienda y SKU. Con Fuente = ERP el Resumen muestra tres tarjetas: Total, Inventario para venta (disponible) y Reservado. Enlaces directos: `?fuente=erp`, `?fuente=plat`, `#almacen`, `#canal`, `#mov`. |
| `index.html` | Panel de administración de inventario (versión vertical). |
| `index_horizontal.html` | El mismo panel en columnas para pantalla ancha. |

Se abren con doble clic (no necesitan servidor). Los originales de `ERP\Concentrados` y `PLATAFORMAS\Concentrados` nunca se modifican: los scripts solo los leen.

## Cómo está armado (datos separados de la interfaz)

```
scripts/generar_datos.py        Transformación: concentrados → data/dashboard_data.js   (única fuente de números)
scripts/armar_disponible.py     Une los 4 archivos DISPONIBLE del ERP en un Excel para el paso anterior
scripts/auditar_concentrados.py Revisión de calidad (duplicados, costos, relación entre fuentes) → data/auditoria.js
js/engine.js                    Motor de cálculo sin DOM: filtros, existencias, vendible/no vendible, canales, movimientos, SKU nuevos, baja rotación
js/kit.js                       Componentes de interfaz compartidos (cifras, tablas, aros, barras, filtros, eventos)
css/                            panel.css (base) · ejecutivo.css · horizontal.css
tests/                          Pruebas (ver abajo)
```

Las tres páginas usan el mismo `engine.js` y `kit.js`; no hay otro motor de cálculo.

## Actualizar con un corte nuevo

```powershell
$B = "C:\Users\AnalistadeDatos1\OneDrive - SELECT SHOP MB SA DE CV\01 Business Intelligence\Inventario General BI"
# 1) (opcional) disponible/reservado del corte: un Excel por empresa, ya limpios, en ERP\2026\<mes>\<EMPRESA>\
py scripts\armar_disponible.py "$B\ERP\2026\10 Octubre" 2026-10-21 disponible.xlsx
# 2) datos del dashboard
py scripts\generar_datos.py "$B\PLATAFORMAS\Concentrados\Concentrado_PLATAFORMAS_Oct_2026.xlsx" "$B\ERP\Concentrados\Concentrado_ERP_Oct_2026.xlsx" disponible.xlsx
# 3) calidad de datos (queda en data/auditoria.js y data/auditoria.json)
py scripts\auditar_concentrados.py "<plataformas.xlsx>" "<erp.xlsx>" "$B\ERP\2026\10 Octubre" 2026-10-21
```

Si Excel tiene abierto un concentrado, Windows lo bloquea: trabaja con una copia.

## Pruebas

```powershell
node tests\test_engine.js                                            # motor: cuadres, conservación de movimientos, filtros (37)
py tests\test_datos.py <plataformas.xlsx> <erp.xlsx> <disponible.xlsx>   # conciliación contra los Excel originales (44)
powershell -File tests\run_ui_smoke.ps1                              # interfaz: resumen, pestañas por fuente, filtros, búsqueda, limpiar (72)
```

## Definiciones

- **Valor y piezas**: `Total` y `Costo Inventario` (a costo, sin IVA) de cada concentrado. Cada fecha es un corte (foto), no una transacción.
- **Inventario** = ERP + Plataformas *ocupando espacio* (Aptas para vender y No aptas para vender). **En camino** (Pendientes de ingreso, En transferencia, Devueltas por el comprador) y los procesos internos **En revisión** y **Extraviadas** NO cuentan (ni piezas ni valor): se definen en `EN_CAMINO` / `PROCESO_INTERNO` de `scripts/generar_datos.py`, se guardan por estatus, corte y tienda en `meta.excluido` y el Resumen los muestra aparte, como "flujo" de Plataformas (solo con Fuente = Plataformas), con piezas, valor y variación contra el corte anterior.
- **Todos** = ERP total + Plataformas. ERP y Plataformas son existencias distintas; **disponible y reservado** clasifican el mismo stock ERP y nunca se suman al total.
- **Inventario para venta** = ERP "Disponible para la venta" + Plataformas "Aptas para vender". **Vendible** = Plataformas "Aptas para vender" + ERP "Disponible para la venta" (solo con archivo DISPONIBLE). **No vendible** = el resto de los estatus de Plataformas. **Comprometido** = ERP reservado (asignado + reservado + autorizado). La regla vive en `cfg` de `generar_datos.py`.
- **Movimiento** = variación de existencias de un SKU entre cortes consecutivos (aumento = entrada, disminución = salida), valorizada al costo promedio. No hay ventas ni compras en los concentrados.
- **Categorías que más se mueven** (Resumen): por ERP y por Plataformas, *Tenía + Entró − Salió = Tiene* en valor a costo y piezas. Cuenta todo movimiento entre cortes, incluidos los cambios de estatus o de ubicación del mismo SKU (en Plataformas son casi la mitad de las salidas). No son ventas: los concentrados no las traen; las salidas incluyen ventas, mermas, ajustes y traspasos.
- **Puente del inventario** ("¿Qué está pasando con el inventario?"): por fuente y contra el corte anterior, *inventario anterior + SKU nuevos + entradas de SKU que ya existían − salidas de SKU que ya existían = inventario actual*, con los SKU agotados y, si las piezas y el valor se mueven en sentido contrario, el costo por pieza de lo que entró contra lo que salió.
- **Días desde el último movimiento** (antes "Inventario sin movimiento") = días desde el último cambio de existencias del SKU (precisión = intervalo entre cortes, 1 a 4 días).
- **Advertencia (dashboard ejecutivo):** solo los SKU con existencia que no tuvieron ningún cambio de existencia entre el primer y el último corte, con su número de SKU y su valor detenido; son los mismos de la tarjeta "Sin cambios en todo el periodo". El panel de administración conserva la advertencia completa por sin salidas / baja rotación.
- **Advertencia y sin movimiento cuadran:** las dos secciones parten de los mismos SKU con existencia al último corte y usan los mismos rangos de días (suman lo mismo). La advertencia los clasifica por salidas del periodo: *Sin salidas* (0), *Baja rotación* (menos del 5 % de su existencia) y *Rotación normal* (5 % o más). *Valor detenido* = valor de los dos primeros tipos.
- **Nuevo SKU** = existencia > 0 al corte elegido y ≤ 0 en el anterior. **Baja rotación** = sin salidas o con salidas < 5 % de su existencia en el periodo.

## Lo que los datos actuales no permiten (y el dashboard no inventa)

- Ventas / rotación en unidades vendidas, precio de venta y margen, fecha de entrada del producto.
- Disponible y reservado de más de un corte (solo existe el 21-oct) y de T-LAB (sin archivo).
- Variación del disponible/reservado contra un corte anterior.

## Hallazgos de calidad (están en data/auditoria.json; el dashboard ya no muestra alertas)

- Filas idénticas con existencia (posible doble captura o series distintas): se reportan, no se eliminan.
- Costo 0 con existencia en Plataformas (T-LAB): el valor de esos SKU queda subestimado.
- Disponible + comprometido mayor al ERP total en 1,350 SKU (probable diferencia de hora entre reportes).
- `(SIN SKU)` sin nombre de producto.
- Nexu: su costo en el ERP ya trae IVA (el concentrado aplica 16 % a todo); su valor "sin IVA" puede estar inflado.
