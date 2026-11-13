CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"category_id" text NOT NULL,
	"requester_id" uuid NOT NULL,
	"title" text NOT NULL,
	"location" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_category_id_request_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."request_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_requests_reference_index" ON "service_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "service_requests_requester_id_index" ON "service_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "service_requests_status_index" ON "service_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_requests_category_id_index" ON "service_requests" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "service_requests_submitted_at_index" ON "service_requests" USING btree ("submitted_at");