ALTER TABLE "competition_match" ALTER COLUMN "team1_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_match" ALTER COLUMN "team2_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "challonge_link" text;