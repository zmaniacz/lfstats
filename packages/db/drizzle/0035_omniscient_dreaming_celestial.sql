ALTER TABLE "lb_game_player_state" ADD COLUMN "assists" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "steals_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "steals_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "blocks_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "blocks_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "clears_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "clears_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "passes_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "passes_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_game_player_state" ADD COLUMN "possession_time_ms" integer DEFAULT 0 NOT NULL;