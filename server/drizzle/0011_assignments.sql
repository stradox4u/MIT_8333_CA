CREATE SEQUENCE "public"."timeline_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" integer PRIMARY KEY DEFAULT nextval('timeline_sequence') NOT NULL,
	"service_request_id" uuid NOT NULL,
	"officer_id" uuid NOT NULL,
	"assigned_by_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_id" uuid,
	"end_reason" text
);
--> statement-breakpoint
ALTER TABLE "status_updates" ALTER COLUMN "id" DROP IDENTITY;--> statement-breakpoint
-- Hand-edited: continue after any Status Updates already numbered by the old identity.
SELECT setval('timeline_sequence', (SELECT coalesce(max("id"), 0) + 1 FROM "status_updates"), false);--> statement-breakpoint
ALTER TABLE "status_updates" ALTER COLUMN "id" SET DEFAULT nextval('timeline_sequence');--> statement-breakpoint
ALTER TABLE "status_updates" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "status_updates" ADD COLUMN "assignment_id" integer;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_ended_by_id_users_id_fk" FOREIGN KEY ("ended_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_one_current_index" ON "assignments" USING btree ("service_request_id") WHERE "assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "assignments_officer_id_index" ON "assignments" USING btree ("officer_id");--> statement-breakpoint
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;