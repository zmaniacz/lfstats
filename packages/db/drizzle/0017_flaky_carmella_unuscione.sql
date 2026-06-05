ALTER TABLE "sm5_game_penalty" ADD COLUMN "type" text DEFAULT 'Common Foul' NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_game_penalty" ADD COLUMN "mvp_value" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_game_penalty" ADD COLUMN "in_game" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_game_penalty" ADD COLUMN "rescinded" boolean DEFAULT false NOT NULL;