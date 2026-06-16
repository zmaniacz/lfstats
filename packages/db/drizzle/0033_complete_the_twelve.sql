CREATE TABLE "lb_game_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"time" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_scorecard_id" uuid,
	"target_scorecard_id" uuid,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lb_game_player_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"target_scorecard_id" uuid NOT NULL,
	"steals" integer NOT NULL,
	"blocks" integer NOT NULL,
	"passes" integer NOT NULL,
	CONSTRAINT "lb_game_player_interaction_unique" UNIQUE("game_id","scorecard_id","target_scorecard_id")
);
--> statement-breakpoint
CREATE TABLE "lb_game_player_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"time" integer NOT NULL,
	"score" integer NOT NULL,
	"state" integer NOT NULL,
	"has_ball" boolean NOT NULL,
	"is_active" boolean NOT NULL,
	CONSTRAINT "lb_game_player_state_event_id_scorecard_id_unique" UNIQUE("event_id","scorecard_id")
);
--> statement-breakpoint
CREATE TABLE "lb_game_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"tdf_team_index" integer NOT NULL,
	"is_neutral" boolean NOT NULL,
	"name" text NOT NULL,
	"colour_enum" integer NOT NULL,
	"colour_rgb" text,
	"score" integer,
	"result" "team_result",
	CONSTRAINT "lb_game_team_game_id_tdf_team_index_unique" UNIQUE("game_id","tdf_team_index")
);
--> statement-breakpoint
CREATE TABLE "lb_scorecard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid,
	"team_id" uuid NOT NULL,
	"battlesuit_id" uuid,
	"ipl_id" text,
	"callsign" text NOT NULL,
	"time_played_ms" integer NOT NULL,
	"end_time" integer NOT NULL,
	"goals" integer NOT NULL,
	"big_goals" integer NOT NULL,
	"futile_attacks" integer NOT NULL,
	"bad_attacks_fc" integer NOT NULL,
	"futile_attacks_goal" integer NOT NULL,
	"assists1" integer NOT NULL,
	"assists2" integer NOT NULL,
	"clear_assists1" integer NOT NULL,
	"clear_assists2" integer NOT NULL,
	"passes_done" integer NOT NULL,
	"passes_received" integer NOT NULL,
	"pass_over_opponent" integer NOT NULL,
	"turnover_pass" integer NOT NULL,
	"clears_done" integer NOT NULL,
	"clears_received" integer NOT NULL,
	"clutch_saves" integer NOT NULL,
	"failed_clears_calc" integer NOT NULL,
	"failed_clears_raw" integer NOT NULL,
	"inactive_clear_penalty" integer NOT NULL,
	"no_clear_goal" integer NOT NULL,
	"no_clear_blocks" integer NOT NULL,
	"defense_score" integer NOT NULL,
	"steals_done" integer NOT NULL,
	"steals_received" integer NOT NULL,
	"blocks_done" integer NOT NULL,
	"blocks_received" integer NOT NULL,
	"blocks_with_ball" integer NOT NULL,
	"blocks_before_goal" integer NOT NULL,
	"reset_blocks_done" integer NOT NULL,
	"reset_blocks_received" integer NOT NULL,
	"block_serie_max" integer NOT NULL,
	"big_mid" integer NOT NULL,
	"reset_point" integer NOT NULL,
	"possession_time_ms" integer NOT NULL,
	"misses" integer NOT NULL,
	"target_reset_self" integer NOT NULL,
	"target_reset_player" integer NOT NULL,
	"start_round_ball" integer NOT NULL,
	"start_round_loss" integer NOT NULL,
	"ball_timeout" integer NOT NULL,
	"state0" integer NOT NULL,
	"state2" integer NOT NULL,
	"state3" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lb_game_event" ADD CONSTRAINT "lb_game_event_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_event" ADD CONSTRAINT "lb_game_event_actor_scorecard_id_lb_scorecard_id_fk" FOREIGN KEY ("actor_scorecard_id") REFERENCES "public"."lb_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_event" ADD CONSTRAINT "lb_game_event_target_scorecard_id_lb_scorecard_id_fk" FOREIGN KEY ("target_scorecard_id") REFERENCES "public"."lb_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_player_interaction" ADD CONSTRAINT "lb_game_player_interaction_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_player_interaction" ADD CONSTRAINT "lb_game_player_interaction_scorecard_id_lb_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."lb_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_player_interaction" ADD CONSTRAINT "lb_gpi_tgt_scorecard_id_fk" FOREIGN KEY ("target_scorecard_id") REFERENCES "public"."lb_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD CONSTRAINT "lb_game_player_state_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD CONSTRAINT "lb_game_player_state_event_id_lb_game_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."lb_game_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD CONSTRAINT "lb_game_player_state_scorecard_id_lb_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."lb_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_game_team" ADD CONSTRAINT "lb_game_team_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_scorecard" ADD CONSTRAINT "lb_scorecard_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_scorecard" ADD CONSTRAINT "lb_scorecard_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_scorecard" ADD CONSTRAINT "lb_scorecard_team_id_lb_game_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."lb_game_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_scorecard" ADD CONSTRAINT "lb_scorecard_battlesuit_id_battlesuit_id_fk" FOREIGN KEY ("battlesuit_id") REFERENCES "public"."battlesuit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lb_game_event_game_id_idx" ON "lb_game_event" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "lb_game_event_actor_sc_idx" ON "lb_game_event" USING btree ("actor_scorecard_id");--> statement-breakpoint
CREATE INDEX "lb_game_event_target_sc_idx" ON "lb_game_event" USING btree ("target_scorecard_id");--> statement-breakpoint
CREATE INDEX "lb_gpi_scorecard_id_idx" ON "lb_game_player_interaction" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "lb_gpi_target_scorecard_id_idx" ON "lb_game_player_interaction" USING btree ("target_scorecard_id");--> statement-breakpoint
CREATE INDEX "lb_game_player_state_sc_time_idx" ON "lb_game_player_state" USING btree ("game_id","scorecard_id","time");--> statement-breakpoint
CREATE INDEX "lb_game_player_state_event_id_idx" ON "lb_game_player_state" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "lb_game_player_state_scorecard_id_idx" ON "lb_game_player_state" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "lb_scorecard_game_id_idx" ON "lb_scorecard" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "lb_scorecard_team_id_idx" ON "lb_scorecard" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "lb_scorecard_player_id_idx" ON "lb_scorecard" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "lb_scorecard_battlesuit_id_idx" ON "lb_scorecard" USING btree ("battlesuit_id");--> statement-breakpoint
CREATE INDEX "lb_scorecard_ipl_id_idx" ON "lb_scorecard" USING btree ("ipl_id");