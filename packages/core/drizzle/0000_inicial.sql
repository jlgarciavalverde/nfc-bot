CREATE TYPE "public"."estado_comercio" AS ENUM('pendiente', 'interesado', 'si', 'no', 'cliente');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'bizum', 'transferencia', 'tarjeta', 'otro');--> statement-breakpoint
CREATE TYPE "public"."resultado_visita" AS ENUM('si', 'no', 'luego', 'interesado');--> statement-breakpoint
CREATE TYPE "public"."rol_socio" AS ENUM('admin', 'socio');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('aportacion', 'gasto', 'ingreso', 'retirada');--> statement-breakpoint
CREATE TYPE "public"."tipo_oferta" AS ENUM('nxm', 'pack', 'descuento');--> statement-breakpoint
CREATE TABLE "ajustes" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comercios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comercios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"nombre_norm" text NOT NULL,
	"tipo" text,
	"zona" text,
	"direccion" text,
	"contacto" text,
	"maps_url" text,
	"nota" text,
	"lat" real,
	"lon" real,
	"estado" "estado_comercio" DEFAULT 'pendiente' NOT NULL,
	"motivo_no" text,
	"responsable_id" integer,
	"creado_por" integer,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consumos" (
	"venta_id" integer NOT NULL,
	"lote_id" integer NOT NULL,
	"uds" integer NOT NULL,
	"coste_cent" integer NOT NULL,
	CONSTRAINT "consumos_venta_id_lote_id_pk" PRIMARY KEY("venta_id","lote_id")
);
--> statement-breakpoint
CREATE TABLE "enlaces_panel" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"socio_id" integer NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"usado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "envios" (
	"clave" text PRIMARY KEY NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lotes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"producto_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"uds" integer NOT NULL,
	"uds_restantes" integer NOT NULL,
	"coste_cent" integer NOT NULL,
	"proveedor" text,
	"socio_id" integer NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movimientos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tipo" "tipo_movimiento" NOT NULL,
	"importe_cent" integer NOT NULL,
	"fecha" date NOT NULL,
	"socio_id" integer NOT NULL,
	"categoria" text,
	"nota" text,
	"venta_id" integer,
	"lote_id" integer,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone,
	CONSTRAINT "importe_positivo" CHECK ("movimientos"."importe_cent" > 0)
);
--> statement-breakpoint
CREATE TABLE "ofertas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ofertas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"producto_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_oferta" NOT NULL,
	"n" integer NOT NULL,
	"m" integer,
	"precio_cent" integer,
	"descuento_bp" integer,
	"desde" date,
	"hasta" date,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"socio_id" integer,
	"tipo" text NOT NULL,
	"resumen" text NOT NULL,
	"deshacer" jsonb,
	"origen" text DEFAULT 'bot' NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deshecha_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pendientes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pendientes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"socio_id" integer,
	"telegram_id" bigint,
	"accion" jsonb NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"resuelta_at" timestamp with time zone,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "productos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"nombre_norm" text NOT NULL,
	"precio_cent" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productos_nombreNorm_unique" UNIQUE("nombre_norm")
);
--> statement-breakpoint
CREATE TABLE "recordatorios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recordatorios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"comercio_id" integer NOT NULL,
	"socio_id" integer NOT NULL,
	"visita_id" integer,
	"fecha" date NOT NULL,
	"nota" text,
	"hecho_at" timestamp with time zone,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"socio_id" integer NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "socios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "socios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"telegram_id" bigint NOT NULL,
	"nombre" text NOT NULL,
	"username" text,
	"rol" "rol_socio" DEFAULT 'socio' NOT NULL,
	"pct_reparto" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "socios_telegramId_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "tramos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tramos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"producto_id" integer NOT NULL,
	"desde_uds" integer NOT NULL,
	"precio_cent" integer,
	"descuento_bp" integer,
	CONSTRAINT "tramos_uno_de_dos" CHECK (("tramos"."precio_cent" is null) <> ("tramos"."descuento_bp" is null))
);
--> statement-breakpoint
CREATE TABLE "uso_ia" (
	"fecha" date PRIMARY KEY NOT NULL,
	"peticiones" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ventas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"comercio_id" integer NOT NULL,
	"socio_id" integer NOT NULL,
	"producto_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"uds" integer NOT NULL,
	"total_cent" integer NOT NULL,
	"precio_lista_cent" integer NOT NULL,
	"aplicado" text NOT NULL,
	"coste_cent" integer,
	"cobrada" boolean DEFAULT false NOT NULL,
	"metodo" "metodo_pago",
	"nota" text,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visitas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "visitas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"comercio_id" integer NOT NULL,
	"socio_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"resultado" "resultado_visita" NOT NULL,
	"nota" text,
	"proxima_fecha" date,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comercios" ADD CONSTRAINT "comercios_responsable_id_socios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comercios" ADD CONSTRAINT "comercios_creado_por_socios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enlaces_panel" ADD CONSTRAINT "enlaces_panel_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendientes" ADD CONSTRAINT "pendientes_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_comercio_id_comercios_id_fk" FOREIGN KEY ("comercio_id") REFERENCES "public"."comercios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramos" ADD CONSTRAINT "tramos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_comercio_id_comercios_id_fk" FOREIGN KEY ("comercio_id") REFERENCES "public"."comercios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_comercio_id_comercios_id_fk" FOREIGN KEY ("comercio_id") REFERENCES "public"."comercios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comercios_nombre_norm" ON "comercios" USING btree ("nombre_norm");--> statement-breakpoint
CREATE INDEX "comercios_estado" ON "comercios" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "consumos_lote" ON "consumos" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "movimientos_fecha" ON "movimientos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "movimientos_venta" ON "movimientos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "operaciones_socio" ON "operaciones" USING btree ("socio_id","creado_at");--> statement-breakpoint
CREATE INDEX "recordatorios_fecha" ON "recordatorios" USING btree ("fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "tramos_producto_desde" ON "tramos" USING btree ("producto_id","desde_uds");--> statement-breakpoint
CREATE INDEX "ventas_comercio" ON "ventas" USING btree ("comercio_id");--> statement-breakpoint
CREATE INDEX "ventas_socio" ON "ventas" USING btree ("socio_id");--> statement-breakpoint
CREATE INDEX "ventas_fecha" ON "ventas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "visitas_comercio" ON "visitas" USING btree ("comercio_id");--> statement-breakpoint
CREATE INDEX "visitas_socio" ON "visitas" USING btree ("socio_id");