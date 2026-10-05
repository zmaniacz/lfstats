CREATE TABLE "api_request_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"status" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"row_count" integer,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "scopes" text[] DEFAULT '{"video:write"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "rate_limit_per_day" integer;--> statement-breakpoint
ALTER TABLE "api_request_log" ADD CONSTRAINT "api_request_log_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_request_log_key_created_idx" ON "api_request_log" USING btree ("api_key_id","created_at");