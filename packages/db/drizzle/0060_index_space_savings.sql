-- Exists on prod but in neither schema.ts nor any migration: reads all lead with game_id (sc_time_idx) and the
-- scorecard cascade is served by sm5_game_player_state_scorecard_id_idx. ~2 GB.
DROP INDEX IF EXISTS "sm5_game_player_state_scorecard_id_time_idx";--> statement-breakpoint
DROP INDEX "lb_game_player_state_event_id_idx";--> statement-breakpoint
DROP INDEX "sm5_game_event_target_sc_idx";--> statement-breakpoint
DROP INDEX "sm5_game_event_actor_gt_idx";--> statement-breakpoint
DROP INDEX "sm5_game_event_target_gt_idx";--> statement-breakpoint
CREATE INDEX "sm5_game_event_target_sc_idx" ON "sm5_game_event" USING btree ("target_scorecard_id") WHERE "sm5_game_event"."target_scorecard_id" is not null;--> statement-breakpoint
CREATE INDEX "sm5_game_event_actor_gt_idx" ON "sm5_game_event" USING btree ("actor_game_target_id") WHERE "sm5_game_event"."actor_game_target_id" is not null;--> statement-breakpoint
CREATE INDEX "sm5_game_event_target_gt_idx" ON "sm5_game_event" USING btree ("target_game_target_id") WHERE "sm5_game_event"."target_game_target_id" is not null;