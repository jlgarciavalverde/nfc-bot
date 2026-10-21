CREATE TABLE "tandas_placas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tandas_placas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"n" integer NOT NULL,
	"nota" text,
	"creado_por" integer,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "placas" ADD COLUMN "tanda_id" integer;--> statement-breakpoint
ALTER TABLE "placas" ADD COLUMN "nfc_grabada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "placas" ADD COLUMN "nfc_bloqueada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tandas_placas" ADD CONSTRAINT "tandas_placas_creado_por_socios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placas" ADD CONSTRAINT "placas_tanda_id_tandas_placas_id_fk" FOREIGN KEY ("tanda_id") REFERENCES "public"."tandas_placas"("id") ON DELETE no action ON UPDATE no action;