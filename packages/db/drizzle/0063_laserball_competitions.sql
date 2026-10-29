CREATE TYPE "public"."competition_game_type" AS ENUM('sm5', 'lb');--> statement-breakpoint
ALTER TABLE "competition_team_adjustment" ALTER COLUMN "points" SET DATA TYPE numeric(5, 1);--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "game_type" "competition_game_type" DEFAULT 'sm5' NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_match" ADD COLUMN "competition_match_id" uuid;--> statement-breakpoint
ALTER TABLE "lb_scorecard" ADD COLUMN "is_mercenary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lb_match" ADD CONSTRAINT "lb_match_competition_match_id_competition_match_id_fk" FOREIGN KEY ("competition_match_id") REFERENCES "public"."competition_match"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_match" ADD CONSTRAINT "lb_match_competition_match_id_unique" UNIQUE("competition_match_id");--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_lb_format_check" CHECK ("competition"."game_type" <> 'lb' or "competition"."format" = 'team');