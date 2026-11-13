ALTER TABLE "service_requests" ADD COLUMN "demo_key" text;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_demoKey_unique" UNIQUE("demo_key");