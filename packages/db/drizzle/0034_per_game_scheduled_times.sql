ALTER TABLE "competition_match" ADD COLUMN "game1_scheduled_start_time" timestamp;--> statement-breakpoint
ALTER TABLE "competition_match" ADD COLUMN "game2_scheduled_start_time" timestamp;--> statement-breakpoint
UPDATE "competition_match" SET "game1_scheduled_start_time" = "scheduled_time" WHERE "scheduled_time" IS NOT NULL;--> statement-breakpoint
UPDATE "competition_match" SET "game2_scheduled_start_time" = "scheduled_time" + INTERVAL '80 minutes' WHERE "scheduled_time" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_match" DROP COLUMN "scheduled_time";
