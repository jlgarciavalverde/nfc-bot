CREATE TABLE "placas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "placas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"codigo" text NOT NULL,
	"comercio_id" integer,
	"asignada_por" integer,
	"asignada_at" timestamp with time zone,
	"escaneos" integer DEFAULT 0 NOT NULL,
	"ultimo_escaneo_at" timestamp with time zone,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placas_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "comercios" ADD COLUMN "resenas_url" text;--> statement-breakpoint
ALTER TABLE "placas" ADD CONSTRAINT "placas_comercio_id_comercios_id_fk" FOREIGN KEY ("comercio_id") REFERENCES "public"."comercios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placas" ADD CONSTRAINT "placas_asignada_por_socios_id_fk" FOREIGN KEY ("asignada_por") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placas_comercio" ON "placas" USING btree ("comercio_id");