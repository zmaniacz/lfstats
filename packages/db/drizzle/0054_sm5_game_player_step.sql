CREATE TABLE "sm5_game_player_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"time" integer NOT NULL,
	"delta" smallint NOT NULL,
	"total" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sm5_game_player_step" ADD CONSTRAINT "sm5_game_player_step_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_player_step" ADD CONSTRAINT "sm5_game_player_step_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sm5_game_player_step_sc_time_idx" ON "sm5_game_player_step" USING btree ("game_id","scorecard_id","time");