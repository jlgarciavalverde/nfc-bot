CREATE TABLE "efimeros" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "efimeros_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chat_id" bigint NOT NULL,
	"message_id" integer NOT NULL,
	"clave" text,
	"borrar_at" timestamp with time zone NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "efimeros_borrar" ON "efimeros" USING btree ("borrar_at");--> statement-breakpoint
CREATE INDEX "efimeros_clave" ON "efimeros" USING btree ("clave");