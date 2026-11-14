CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"service_request_id" uuid,
	"stage" text,
	"upload_key" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"attached_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"unattached_since" timestamp with time zone,
	"upload_deleted_at" timestamp with time zone,
	CONSTRAINT "photos_uploadKey_unique" UNIQUE("upload_key"),
	CONSTRAINT "photos_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "photos_attachment" CHECK (("photos"."service_request_id" is null and "photos"."stage" is null and "photos"."attached_at" is null and "photos"."unattached_since" is not null) or ("photos"."service_request_id" is not null and "photos"."stage" is not null and "photos"."attached_at" is not null and "photos"."unattached_since" is null))
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_service_request_id_index" ON "photos" USING btree ("service_request_id");--> statement-breakpoint
CREATE INDEX "photos_unattached_since_index" ON "photos" USING btree ("unattached_since");--> statement-breakpoint
CREATE INDEX "photos_uploaded_at_index" ON "photos" USING btree ("uploaded_at");