# finance-ms

Microservicio de contabilidad, flujo de caja y punto de equilibrio de **Syner**, construido con NestJS, gRPC, RabbitMQ y Prisma sobre PostgreSQL (`finance-db`).

Cada organización es un negocio, por ejemplo uno de granizados, con su contabilidad separada de las finanzas personales de sus dueños. finance-ms **complementa** a los otros servicios sin cambiar sus reglas:

| Servicio | Fuente de verdad de |
|---|---|
| products-ms | Insumos, stock, stock mínimo y alertas |
| orders-ms | Órdenes de compra y su saga |
| **finance-ms** | Ventas, costos en pesos por insumo, recetas, gastos, cuentas por pagar, crédito, retiros, reserva, cascada, punto de equilibrio y escenarios |

## Integración

```
Venta (finance-ms) ──finance.sale.registered──▶ products-ms: salida de los insumos de la receta
finance-ms ◀── finance.sale.stock.applied | .rejected ──┘     (todo o nada, motivo "Venta <id>")

orders-ms ──purchase-order.received──▶ products-ms (+stock, como siempre)
                                  └──▶ finance-ms  (cuenta por pagar valorada al costo de referencia)

finance-ms ──gRPC de solo lectura──▶ products-ms FindAll/FindOne (stock) · orders-ms FindAll (órdenes abiertas)
```

- products-ms cuenta unidades enteras. Una receta puede usar fracciones (0,05 de bolsa de hielo por granizado): finance-ms acumula la fracción y descuenta una bolsa cada 20 granizados.
- Si products-ms rechaza el descuento (por ejemplo, por falta de stock), la venta se conserva porque el dinero sí entró, y el dashboard muestra **inventario desincronizado**. Después de corregir el stock, `POST /api/finance/sales/:id/retry-stock` reenvía el descuento, que es idempotente.
- Si products-ms u orders-ms no responden, la reposición se estima con las ventas promedio (`inventario_estimado: true`) y no se permiten retiros forzados.

## Reglas principales

- **Utilidad operativa** = ventas − costos y gastos operativos (variables + fijos). **Flujo disponible** = utilidad operativa − cuota asignada del crédito. Los retiros, aportes, abonos y traslados a la reserva nunca son gastos.
- **Cascada** (el efectivo no es de los dueños). El efectivo de CAJA y BANCO cubre primero:
  1. Los pendientes: cuentas por pagar, gastos pendientes y órdenes de compra abiertas.
  2. La reposición del inventario, con el stock real.
  3. La cuota del mes.
  4. El faltante de la reserva (meta: meses de costos fijos).

  Lo que queda es el **excedente**. La **utilidad distribuible** = mín(excedente, utilidades no distribuidas).
- **Retiro**: se acepta si no supera la utilidad distribuible. Si la supera, solo el owner puede forzarlo con un motivo, y queda marcado como **descapitalización**.
- **Abono extraordinario**: requiere el capital de trabajo cubierto y la reserva completa, y no puede superar el excedente.
- **Punto de equilibrio**:
  - Margen unitario = precio − costo variable unitario.
  - PE en unidades = ⌈costos fijos / margen⌉.
  - PE diario = ⌈PE / días de operación⌉.
  - "Con crédito" suma la cuota a los costos fijos.
- **Cierre de mes**: congela el estado de resultados, el punto de equilibrio y la cascada. No se puede cerrar con descuentos de stock rechazados. Mientras el período esté cerrado no se registran movimientos en él; el owner puede reabrirlo indicando un motivo.

Las fórmulas están en [`src/calculations/`](src/calculations), con sus tests.

## API (por el gateway, `/api/finance`)

| Ruta | Roles |
|---|---|
| `POST sales`, `GET recipes` | cualquiera |
| `POST expenses`, `PATCH expenses/:id/pay`, `GET movements`, `GET/PUT supplies/:productoId`, `POST/PATCH recipes`, `GET sales`, `POST sales/:id/retry-stock`, `GET payables`, `PATCH payables/:id/pay`, `GET credits`, `POST credits/:id/installments`, `GET/PUT assumptions`, `GET policy`, `GET income-statement?periodo=`, `GET waterfall`, `GET break-even`, `GET scenarios?niveles=30,50`, `GET dashboard` | owner, admin |
| `POST contributions`, `POST withdrawals`, `POST reserve/transfers`, `POST credits`, `POST credits/:id/prepayments`, `PATCH policy`, `POST periods/:periodo/close`, `POST periods/:periodo/reopen` | owner |

`GET /api/finance/dashboard` responde las cinco preguntas del dueño (`respuestas`):

| Pregunta | Campo |
|---|---|
| ¿Cuánto vender por día para no perder? | `vender_por_dia` y `vender_por_dia_con_credito` |
| ¿Cuánto se gana realmente? | `utilidad_operativa` y `flujo_disponible` |
| ¿Cuánto dejar en el negocio? | `dejar_en_el_negocio` |
| ¿Cuánto se puede retirar? | `retiro_maximo` |
| ¿Cuánto se puede abonar al crédito? | `abono_maximo` |

## Desarrollo

```bash
pnpm install
cp .env.template .env
pnpm prisma migrate dev
pnpm start:dev
pnpm test
```
