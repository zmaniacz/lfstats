ALTER TYPE "public"."competition_format" ADD VALUE 'duos';--> statement-breakpoint
ALTER TABLE "competition_match" DROP CONSTRAINT "competition_match_distinct_teams_check";--> statement-breakpoint
ALTER TABLE "competition_match" ADD COLUMN "team1_partner2_id" uuid;--> statement-breakpoint
ALTER TABLE "competition_match" ADD COLUMN "team2_partner2_id" uuid;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_team1_partner2_id_competition_team_id_fk" FOREIGN KEY ("team1_partner2_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_team2_partner2_id_competition_team_id_fk" FOREIGN KEY ("team2_partner2_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_distinct_teams_check" CHECK ("competition_match"."team1_id" <> "competition_match"."team2_id"
        and "competition_match"."team1_partner_id" <> "competition_match"."team1_id" and "competition_match"."team1_partner_id" <> "competition_match"."team2_id"
        and "competition_match"."team2_partner_id" <> "competition_match"."team1_id" and "competition_match"."team2_partner_id" <> "competition_match"."team2_id"
        and "competition_match"."team1_partner_id" <> "competition_match"."team2_partner_id"
        and "competition_match"."team1_partner2_id" <> "competition_match"."team1_id" and "competition_match"."team1_partner2_id" <> "competition_match"."team2_id"
        and "competition_match"."team1_partner2_id" <> "competition_match"."team1_partner_id" and "competition_match"."team1_partner2_id" <> "competition_match"."team2_partner_id"
        and "competition_match"."team2_partner2_id" <> "competition_match"."team1_id" and "competition_match"."team2_partner2_id" <> "competition_match"."team2_id"
        and "competition_match"."team2_partner2_id" <> "competition_match"."team1_partner_id" and "competition_match"."team2_partner2_id" <> "competition_match"."team2_partner_id"
        and "competition_match"."team1_partner2_id" <> "competition_match"."team2_partner2_id");