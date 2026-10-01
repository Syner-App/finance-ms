# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (not npm). Native build scripts for Prisma, `protobufjs`, `grpc-tools` and `esbuild` are allowlisted in `pnpm-workspace.yaml` (`allowBuilds`).

```bash
pnpm install
pnpm start:dev            # watch mode (nest start --watch)
pnpm build                # nest build -> dist/ (uses tsconfig.build.json, rootDir src)
pnpm lint                 # oxlint --type-aware src/ test/
pnpm proto:gen            # regenerate src/generated/proto/{finance,products,orders}.ts from src/proto/*.proto
pnpm prisma migrate dev   # create/apply migrations against finance-db (localhost:5434)

pnpm test                 # vitest unit tests (**/*.spec.ts)
pnpm vitest run src/calculations   # the business formulas only
```

Vitest runs with `globals: true`. Docker: `docker compose up -d --build` from the `syner/` root runs the whole stack in dev mode (bind-mounted `src/` and `prisma/`, `start:dev`).

## Environment

`src/config/envs.ts` validates `process.env` with Joi at import time. Required: `PORT` (gRPC, 3004), `DATABASE_URL` (app role `finance_app`, no superuser, so RLS applies), `RABBITMQ_URL`, `PRODUCTS_MICROSERVICE_HOST/PORT` and `ORDERS_MICROSERVICE_HOST/PORT`. Optional: `BUSINESS_TIMEZONE` (default `America/Bogota`: decides the day, and so the period, of a movement registered without `fecha`) and `OUTBOX_POLL_INTERVAL_MS`. The Prisma CLI (`prisma7.config.ts`) prefers `MIGRATE_DATABASE_URL` (table owner). Consume config via `envs`.

## Architecture

NestJS 12 **hybrid app** (no HTTP server): accounting, cash flow and break-even of the business of each organization. gRPC `finance.FinanceService` for the gateway (`src/proto/finance.proto`) + one RabbitMQ inbox queue. Same conventions as products-ms/orders-ms: ESM + `nodenext`, snake_case fields end to end (`loader: { keepCase: true, enums: String, longs: Number }`; money is int64 → number), `@GrpcMethod(FINANCE_SERVICE_NAME, ...)` + `@Payload()`, `RpcException` with gRPC status codes, global `ValidationPipe` → `INVALID_ARGUMENT`.

- **It complements, never duplicates**: products-ms is the source of truth of the supplies and their stock, orders-ms of the purchase orders. finance-ms only adds money: costs in pesos per supply, recipes, sales, expenses, payables, credit, withdrawals, reserve, waterfall, break-even and scenarios. It changes no business rule of the other services.
- **Integration**:
  - **Sale → stock (event)**: `SalesService.registerSale` writes the sale, the `VENTAS` income and, in the same transaction, the outbox event `finance.sale.registered` (`{ organization_id, saleId, consumos: [{ producto_id, cantidad }] }`). products-ms discounts the supplies (all or nothing, idempotent by `motivo = "Venta <saleId>"`) and answers `finance.sale.stock.applied | .rejected` → `estado_stock`. The sale is never reverted (the money came in); `RetrySaleStock` sends the same event again. products-ms counts whole units, so the recipe fraction is accumulated on `Supply.consumo_pendiente` (rows locked `FOR UPDATE`) and only whole units are sent.
  - **Purchase received → payable (event)**: the inbox gets its own copy of `purchase-order.received` (orders-ms) and creates a `Payable` (unique `(organization_id, purchase_order_id)`, valued at the supply reference cost; accrued in the first open period). `PayPayable` records the expense and sets the reference cost to the bill / quantity.
  - **Reads (gRPC, read-only)**: `src/integrations/` (`InventoryClient`: products `FindOne/FindAll`; `PurchasingClient`: orders `FindAll` of `EN_VALIDACION/PENDIENTE/APROBADA`). Called outside transactions; if one fails, the waterfall falls back to `estimatedReplenishment` and flags `inventario_estimado` (forced withdrawals are then refused). finance-ms never writes to another service over gRPC.
- **RabbitMQ**: one server on queue `finance.events` (topic exchange `syner.events`, DLX `syner.dlx` → `finance.events.dlq`, `noAck: false`). With `wildcards: true` Nest binds the queue to the pattern of **every** RMQ handler of the app, so a second exchange-bound queue would receive duplicates: keep one inbox. Handlers take `unknown` and go through `processEvent()` (`src/common/rmq/process-event.ts`: parse → handler → ack; invalid → DLQ; error → requeue once, then DLQ). Event contracts: `src/common/events/finance.events.ts` (duplicated in products-ms) and `purchase-order.events.ts` (orders-ms). Declare queues/bindings in `syner/rabbitmq/definitions.json` too.
- **Business rules** live in pure functions in `src/calculations/` (income statement, break-even, scenarios, replenishment, waterfall + withdrawal/prepayment decisions, recovery, fractional consumption) with their tests; services only load data and persist. The category of a movement fixes its nature (`src/common/categories.ts`): only `VENTAS` and the operating expenses enter the operating profit.
- **Money decisions** (`TreasuryService.registerWithdrawal`, `prepayCredit`, reserve transfers, period close) run under `lockTreasury()` (a transaction-scoped advisory lock per organization) and recompute the waterfall inside the transaction.
- **Periods**: missing row = open. `ClosePeriod` stores the income statement, break-even and waterfall in `Period.resumen` (refused while the period has rejected stock discounts); writes accrued in a closed period fail with `FAILED_PRECONDITION` (`assertOpenPeriod`). Paying an older pending expense or bill is allowed (its accrual does not change).
- **Multitenancy**: every table but `outbox_events` has `organization_id` + the `tenant_isolation` RLS policy (init migration, hand-written `DO` block). Run tenant queries through `PrismaService.withTenant()` and filter by `organization_id` explicitly too.
- **Persistence**: Prisma 7 + PostgreSQL (`finance-db`, host port 5434). `PrismaService` is provided and exported by `OutboxModule`; feature modules import `OutboxModule` (one instance, no PrismaModule). Money columns are `INTEGER` pesos; unit costs and recipe quantities `DECIMAL(14,4)` (convert with `Number()`).
- **Tests**: unit specs mock `PrismaService` (`withTenant: (orgId, cb) => cb(tx)`), the outbox and build `RmqContext` for handlers. `.env.template` doubles as the test env in `Dockerfile.prod`.
