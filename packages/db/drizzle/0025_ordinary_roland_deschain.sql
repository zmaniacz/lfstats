CREATE INDEX "sm5_game_event_game_id_idx" ON "sm5_game_event" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_game_event_actor_sc_idx" ON "sm5_game_event" USING btree ("actor_scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_game_event_target_sc_idx" ON "sm5_game_event" USING btree ("target_scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_game_event_actor_gt_idx" ON "sm5_game_event" USING btree ("actor_game_target_id");--> statement-breakpoint
CREATE INDEX "sm5_game_event_target_gt_idx" ON "sm5_game_event" USING btree ("target_game_target_id");--> statement-breakpoint
CREATE INDEX "sm5_game_penalty_scorecard_id_idx" ON "sm5_game_penalty" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_gpi_scorecard_id_idx" ON "sm5_game_player_interaction" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_gpi_target_scorecard_id_idx" ON "sm5_game_player_interaction" USING btree ("target_scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_game_player_state_scorecard_id_idx" ON "sm5_game_player_state" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_game_target_game_team_id_idx" ON "sm5_game_target" USING btree ("game_team_id");--> statement-breakpoint
CREATE INDEX "sm5_gtd_game_target_id_idx" ON "sm5_game_target_destruction" USING btree ("game_target_id");--> statement-breakpoint
CREATE INDEX "sm5_gtd_scorecard_id_idx" ON "sm5_game_target_destruction" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_scorecard_game_id_idx" ON "sm5_scorecard" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_scorecard_team_id_idx" ON "sm5_scorecard" USING btree ("team_id");