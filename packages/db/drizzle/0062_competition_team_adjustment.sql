CREATE TABLE "competition_team_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_team_adjustment_points_nonzero_check" CHECK ("competition_team_adjustment"."points" <> 0)
);
--> statement-breakpoint
ALTER TABLE "competition_team_adjustment" ADD CONSTRAINT "competition_team_adjustment_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_team_adjustment" ADD CONSTRAINT "competition_team_adjustment_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_team_adjustment_competition_id_idx" ON "competition_team_adjustment" USING btree ("competition_id");