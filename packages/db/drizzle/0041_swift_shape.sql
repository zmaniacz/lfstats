ALTER TABLE "sm5_game_player_interaction" ADD COLUMN "resets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_game_player_interaction" ADD COLUMN "missile_resets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD COLUMN "times_reset" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD COLUMN "times_reset_by_missile" integer DEFAULT 0 NOT NULL;