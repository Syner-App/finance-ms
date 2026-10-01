-- CreateEnum
CREATE TYPE "Account" AS ENUM ('CAJA', 'BANCO', 'RESERVA');

-- CreateEnum
CREATE TYPE "TypeMovement" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "MovementCategory" AS ENUM ('VENTAS', 'MATERIA_PRIMA', 'EMPAQUES', 'TRANSPORTE', 'SERVICIOS', 'ARRIENDO', 'SALARIOS', 'PUBLICIDAD', 'OTROS_OPERATIVOS', 'CUOTA_CREDITO', 'ABONO_EXTRAORDINARIO', 'RETIRO_PROPIETARIO', 'APORTE_PROPIETARIO', 'TRASLADO_RESERVA');

-- CreateEnum
CREATE TYPE "StatusMovement" AS ENUM ('PAGADO', 'PENDIENTE');

-- CreateEnum
CREATE TYPE "StatusStockDeduction" AS ENUM ('STOCK_PENDIENTE', 'STOCK_APLICADO', 'STOCK_RECHAZADO');

-- CreateEnum
CREATE TYPE "StatusPayable" AS ENUM ('POR_PAGAR', 'PAGADA');

-- CreateEnum
CREATE TYPE "StatusPeriod" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateTable
CREATE TABLE "movimientos" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "tipo" "TypeMovement" NOT NULL,
    "categoria" "MovementCategory" NOT NULL,
    "monto" INTEGER NOT NULL,
    "periodo" CHAR(7) NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "StatusMovement" NOT NULL,
    "cuenta" "Account",
    "pagado_en" DATE,
    "descripcion" VARCHAR,
    "descapitalizacion" BOOLEAN NOT NULL DEFAULT false,
    "referencia_id" VARCHAR(36),
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" SERIAL NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "nombre" VARCHAR NOT NULL,
    "categoria" "MovementCategory" NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,
    "consumo_pendiente" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costos_insumo" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,
    "origen" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supply_id" INTEGER NOT NULL,

    CONSTRAINT "costos_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recetas" (
    "id" SERIAL NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "nombre" VARCHAR NOT NULL,
    "precio_venta" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "recetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receta_insumos" (
    "id" SERIAL NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "supply_id" INTEGER NOT NULL,

    CONSTRAINT "receta_insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "fecha" DATE NOT NULL,
    "periodo" CHAR(7) NOT NULL,
    "cuenta" "Account" NOT NULL,
    "total" INTEGER NOT NULL,
    "costo_total" INTEGER NOT NULL,
    "estado_stock" "StatusStockDeduction" NOT NULL DEFAULT 'STOCK_PENDIENTE',
    "motivo_rechazo" VARCHAR,
    "consumos" JSONB NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_lineas" (
    "id" SERIAL NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "unidades" INTEGER NOT NULL,
    "precio_unitario" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,
    "sale_id" TEXT NOT NULL,
    "recipe_id" INTEGER NOT NULL,

    CONSTRAINT "venta_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_por_pagar" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "supply_id" INTEGER,
    "cantidad" INTEGER NOT NULL,
    "monto_estimado" INTEGER,
    "monto_real" INTEGER,
    "estado" "StatusPayable" NOT NULL DEFAULT 'POR_PAGAR',
    "fecha_recepcion" DATE NOT NULL,
    "periodo" CHAR(7) NOT NULL,
    "pagada_en" DATE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "cuentas_por_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creditos" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "nombre" VARCHAR NOT NULL,
    "saldo_capital" INTEGER NOT NULL,
    "cuota_mensual" INTEGER NOT NULL,
    "cuota_asignada" INTEGER NOT NULL,
    "dia_pago" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "creditos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supuestos_equilibrio" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "precio_promedio" INTEGER NOT NULL,
    "costo_variable_unitario" INTEGER,
    "arriendo" INTEGER NOT NULL,
    "servicios" INTEGER NOT NULL,
    "salarios" INTEGER NOT NULL,
    "otros_fijos" INTEGER NOT NULL,
    "dias_operacion" INTEGER NOT NULL,
    "inversion_inicial" INTEGER NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supuestos_equilibrio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "politicas" (
    "organization_id" VARCHAR(24) NOT NULL,
    "dias_cobertura" INTEGER NOT NULL DEFAULT 7,
    "meses_reserva" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "porcentaje_retiro" INTEGER NOT NULL DEFAULT 50,
    "niveles_escenario" INTEGER[] DEFAULT ARRAY[30, 50, 75, 100, 150]::INTEGER[],
    "categorias_variables" "MovementCategory"[] DEFAULT ARRAY['MATERIA_PRIMA', 'EMPAQUES', 'TRANSPORTE']::"MovementCategory"[],
    "updatedAt" TIMESTAMP,

    CONSTRAINT "politicas_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "periodos" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "periodo" CHAR(7) NOT NULL,
    "estado" "StatusPeriod" NOT NULL,
    "resumen" JSONB,
    "cerrado_en" TIMESTAMP,
    "reabierto_motivo" VARCHAR,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "periodos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" SERIAL NOT NULL,
    "pattern" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_organization_id_periodo_idx" ON "movimientos"("organization_id", "periodo");

-- CreateIndex
CREATE INDEX "movimientos_organization_id_estado_idx" ON "movimientos"("organization_id", "estado");

-- CreateIndex
CREATE INDEX "movimientos_organization_id_cuenta_idx" ON "movimientos"("organization_id", "cuenta");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_organization_id_producto_id_key" ON "insumos"("organization_id", "producto_id");

-- CreateIndex
CREATE INDEX "costos_insumo_supply_id_createdAt_idx" ON "costos_insumo"("supply_id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "recetas_organization_id_nombre_key" ON "recetas"("organization_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "receta_insumos_recipe_id_supply_id_key" ON "receta_insumos"("recipe_id", "supply_id");

-- CreateIndex
CREATE INDEX "ventas_organization_id_fecha_idx" ON "ventas"("organization_id", "fecha");

-- CreateIndex
CREATE INDEX "ventas_organization_id_estado_stock_idx" ON "ventas"("organization_id", "estado_stock");

-- CreateIndex
CREATE INDEX "venta_lineas_sale_id_idx" ON "venta_lineas"("sale_id");

-- CreateIndex
CREATE INDEX "cuentas_por_pagar_organization_id_estado_idx" ON "cuentas_por_pagar"("organization_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_por_pagar_organization_id_purchase_order_id_key" ON "cuentas_por_pagar"("organization_id", "purchase_order_id");

-- CreateIndex
CREATE INDEX "creditos_organization_id_activo_idx" ON "creditos"("organization_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "supuestos_equilibrio_organization_id_vigente_desde_key" ON "supuestos_equilibrio"("organization_id", "vigente_desde");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_organization_id_periodo_key" ON "periodos"("organization_id", "periodo");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_id_idx" ON "outbox_events"("publishedAt", "id");

-- AddForeignKey
ALTER TABLE "costos_insumo" ADD CONSTRAINT "costos_insumo_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_insumos" ADD CONSTRAINT "receta_insumos_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_insumos" ADD CONSTRAINT "receta_insumos_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_lineas" ADD CONSTRAINT "venta_lineas_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_lineas" ADD CONSTRAINT "venta_lineas_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recetas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Row Level Security: the second barrier behind the organization_id filters in the service.
-- PrismaService.withTenant() runs every query inside a transaction that sets
-- app.organization_id; without it (or for another organization) no row is visible or
-- writable. FORCE applies the policy to the table owner too; superusers still bypass it,
-- so the service connects with a dedicated role (postgres-init/app-role.sh in the syner root).
-- outbox_events has no RLS: OutboxRelay publishes the events of every organization
DO $$
DECLARE
    tenant_table TEXT;
BEGIN
    FOREACH tenant_table IN ARRAY ARRAY[
        'movimientos', 'insumos', 'costos_insumo', 'recetas', 'receta_insumos', 'ventas',
        'venta_lineas', 'cuentas_por_pagar', 'creditos', 'supuestos_equilibrio', 'politicas',
        'periodos'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
        EXECUTE format(
            'CREATE POLICY "tenant_isolation" ON %I '
            'USING ("organization_id" = current_setting(''app.organization_id'', true)) '
            'WITH CHECK ("organization_id" = current_setting(''app.organization_id'', true))',
            tenant_table
        );
    END LOOP;
END
$$;
