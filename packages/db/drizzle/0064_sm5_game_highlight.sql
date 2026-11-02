CREATE TABLE "sm5_game_highlight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"category" text NOT NULL,
	"detector_version" integer NOT NULL,
	"time" integer NOT NULL,
	"window_start" integer NOT NULL,
	"window_end" integer NOT NULL,
	"primary_scorecard_id" uuid,
	"secondary_scorecard_id" uuid,
	"tdf_team_index" integer,
	"magnitude" double precision NOT NULL,
	"details" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sm5_game_highlight" ADD CONSTRAINT "sm5_game_highlight_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_highlight" ADD CONSTRAINT "sm5_game_highlight_primary_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("primary_scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_highlight" ADD CONSTRAINT "sm5_game_highlight_secondary_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("secondary_scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sm5_game_highlight_game_id_idx" ON "sm5_game_highlight" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_game_highlight_category_magnitude_idx" ON "sm5_game_highlight" USING btree ("category","magnitude");--> statement-breakpoint
CREATE INDEX "sm5_game_highlight_primary_sc_idx" ON "sm5_game_highlight" USING btree ("primary_scorecard_id") WHERE "sm5_game_highlight"."primary_scorecard_id" is not null;--> statement-breakpoint
CREATE INDEX "sm5_game_highlight_secondary_sc_idx" ON "sm5_game_highlight" USING btree ("secondary_scorecard_id") WHERE "sm5_game_highlight"."secondary_scorecard_id" is not null;