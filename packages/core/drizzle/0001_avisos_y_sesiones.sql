CREATE TABLE "avisos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "avisos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tipo" text NOT NULL,
	"destino" text DEFAULT 'grupo' NOT NULL,
	"socio_id" integer,
	"texto" text NOT NULL,
	"silencioso" boolean DEFAULT false NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_at" timestamp with time zone,
	"intentos" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "avisos_destino" CHECK ("avisos"."destino" in ('grupo', 'admins', 'socio'))
);
--> statement-breakpoint
ALTER TABLE "enlaces_panel" ADD COLUMN "codigo_hash" text;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "dispositivo" text;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "ultimo_uso_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avisos_pendientes" ON "avisos" USING btree ("enviado_at");--> statement-breakpoint
CREATE INDEX "enlaces_panel_codigo" ON "enlaces_panel" USING btree ("codigo_hash");