ALTER TABLE "competition" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_team" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "competition_team" ADD CONSTRAINT "competition_team_competition_id_slug_unique" UNIQUE("competition_id","slug");