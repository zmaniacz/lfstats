ALTER TYPE "public"."competition_round_type" ADD VALUE 'split-pool';--> statement-breakpoint
CREATE TABLE "competition_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_pool_round_id_name_unique" UNIQUE("round_id","name")
);
--> statement-breakpoint
CREATE TABLE "competition_round_team_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_round_team_pool_round_id_team_id_unique" UNIQUE("round_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "competition_match" ADD COLUMN "pool_id" uuid;--> statement-breakpoint
ALTER TABLE "competition_pool" ADD CONSTRAINT "competition_pool_round_id_competition_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."competition_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_round_team_pool" ADD CONSTRAINT "competition_round_team_pool_round_id_competition_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."competition_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_round_team_pool" ADD CONSTRAINT "competition_round_team_pool_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_round_team_pool" ADD CONSTRAINT "competition_round_team_pool_pool_id_competition_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."competition_pool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_round_team_pool_pool_id_idx" ON "competition_round_team_pool" USING btree ("pool_id");--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_pool_id_competition_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."competition_pool"("id") ON DELETE set null ON UPDATE no action;