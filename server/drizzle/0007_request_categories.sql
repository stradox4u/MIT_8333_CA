CREATE TABLE "request_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "request_categories_code_unique" UNIQUE("code")
);
