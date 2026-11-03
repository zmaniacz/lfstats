ALTER TYPE "public"."notification_kind" ADD VALUE 'auto_assign_review';--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD COLUMN "assigned_by" text;