CREATE TYPE "public"."video_source" AS ENUM('admin', 'api');--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"last_used_at" timestamp,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "game_video" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid,
	"youtube_video_id" text NOT NULL,
	"youtube_url" text NOT NULL,
	"label" text,
	"source" "video_source" NOT NULL,
	"created_by_user_id" text,
	"created_by_api_key_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_video_game_id_player_id_youtube_video_id_unique" UNIQUE NULLS NOT DISTINCT("game_id","player_id","youtube_video_id")
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_auth_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_video" ADD CONSTRAINT "game_video_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_video" ADD CONSTRAINT "game_video_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_video" ADD CONSTRAINT "game_video_created_by_user_id_auth_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_video" ADD CONSTRAINT "game_video_created_by_api_key_id_api_key_id_fk" FOREIGN KEY ("created_by_api_key_id") REFERENCES "public"."api_key"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_video_game_id_idx" ON "game_video" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_video_player_id_idx" ON "game_video" USING btree ("player_id");