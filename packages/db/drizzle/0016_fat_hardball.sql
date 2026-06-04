ALTER TABLE "competition_match" ADD COLUMN "match_number" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "competition_match" ALTER COLUMN "match_number" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_round_id_match_number_unique" UNIQUE("round_id","match_number");
