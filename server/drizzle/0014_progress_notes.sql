CREATE TABLE "progress_notes" (
	"id" integer PRIMARY KEY DEFAULT nextval('timeline_sequence') NOT NULL,
	"service_request_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_notes_service_request_id_index" ON "progress_notes" USING btree ("service_request_id");