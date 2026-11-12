CREATE TABLE "google_identities" (
	"subject" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"linked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_identities" ADD CONSTRAINT "google_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_identities_user_id_index" ON "google_identities" USING btree ("user_id");