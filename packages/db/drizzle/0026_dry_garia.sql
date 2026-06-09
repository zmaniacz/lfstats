CREATE INDEX "auth_account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chomper_job_game_id_idx" ON "chomper_job" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "chomper_job_status_idx" ON "chomper_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "competition_match_competition_id_idx" ON "competition_match" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "competition_team_player_player_id_idx" ON "competition_team_player" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "game_start_time_idx" ON "game" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "game_competition_id_idx" ON "game" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "game_referee_game_id_idx" ON "game_referee" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_tag_assignment_tag_id_idx" ON "game_tag_assignment" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "sm5_game_penalty_game_id_idx" ON "sm5_game_penalty" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_game_penalty_referee_id_idx" ON "sm5_game_penalty" USING btree ("referee_id");--> statement-breakpoint
CREATE INDEX "sm5_scorecard_player_id_idx" ON "sm5_scorecard" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "sm5_scorecard_ipl_id_idx" ON "sm5_scorecard" USING btree ("ipl_id");