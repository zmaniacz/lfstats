-- Hand-edited: drizzle-kit would drop team1/team2_game_team_id before adding the new
-- columns, losing every existing match-game link. Copy them into the sm5 pair first.
ALTER TABLE "competition_match_game" ADD COLUMN "team1_sm5_game_team_id" uuid;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD COLUMN "team2_sm5_game_team_id" uuid;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD COLUMN "team1_pdf_game_team_id" uuid;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD COLUMN "team2_pdf_game_team_id" uuid;--> statement-breakpoint
UPDATE "competition_match_game" SET "team1_sm5_game_team_id" = "team1_game_team_id", "team2_sm5_game_team_id" = "team2_game_team_id";--> statement-breakpoint
ALTER TABLE "competition_match_game" DROP CONSTRAINT "competition_match_game_team1_game_team_id_sm5_game_team_id_fk";--> statement-breakpoint
ALTER TABLE "competition_match_game" DROP CONSTRAINT "competition_match_game_team2_game_team_id_sm5_game_team_id_fk";--> statement-breakpoint
ALTER TABLE "competition_match_game" DROP COLUMN "team1_game_team_id";--> statement-breakpoint
ALTER TABLE "competition_match_game" DROP COLUMN "team2_game_team_id";--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD COLUMN "team1_game_team_id" uuid GENERATED ALWAYS AS (coalesce("competition_match_game"."team1_sm5_game_team_id", "competition_match_game"."team1_pdf_game_team_id")) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD COLUMN "team2_game_team_id" uuid GENERATED ALWAYS AS (coalesce("competition_match_game"."team2_sm5_game_team_id", "competition_match_game"."team2_pdf_game_team_id")) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "cmg_team1_sm5_game_team_id_fk" FOREIGN KEY ("team1_sm5_game_team_id") REFERENCES "public"."sm5_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "cmg_team2_sm5_game_team_id_fk" FOREIGN KEY ("team2_sm5_game_team_id") REFERENCES "public"."sm5_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "cmg_team1_pdf_game_team_id_fk" FOREIGN KEY ("team1_pdf_game_team_id") REFERENCES "public"."sm5_pdf_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "cmg_team2_pdf_game_team_id_fk" FOREIGN KEY ("team2_pdf_game_team_id") REFERENCES "public"."sm5_pdf_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "competition_match_game_one_side_kind_check" CHECK (("competition_match_game"."team1_sm5_game_team_id" is not null and "competition_match_game"."team2_sm5_game_team_id" is not null
           and "competition_match_game"."team1_pdf_game_team_id" is null and "competition_match_game"."team2_pdf_game_team_id" is null)
        or ("competition_match_game"."team1_sm5_game_team_id" is null and "competition_match_game"."team2_sm5_game_team_id" is null
           and "competition_match_game"."team1_pdf_game_team_id" is not null and "competition_match_game"."team2_pdf_game_team_id" is not null));--> statement-breakpoint
ALTER TABLE "sm5_pdf_scorecard" ADD COLUMN "is_mercenary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE VIEW "public"."competition_game_side" AS (
  select id, game_id, score, elimination_bonus, penalty_score, result, eliminated, colour_enum
  from sm5_game_team
  union all
  select id, game_id, score, elimination_bonus, penalty_score, result, eliminated, colour_enum
  from sm5_pdf_game_team
);--> statement-breakpoint
CREATE VIEW "public"."competition_scorecard" AS (
  select id, game_id, team_id, player_id, is_mercenary from sm5_scorecard
  union all
  select id, game_id, team_id, player_id, is_mercenary from sm5_pdf_scorecard
);