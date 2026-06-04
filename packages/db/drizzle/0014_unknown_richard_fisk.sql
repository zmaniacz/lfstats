CREATE TABLE "user_favorite_player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"player_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_player_user_id_player_id_unique" UNIQUE("user_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "user_favorite_player" ADD CONSTRAINT "user_favorite_player_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_player" ADD CONSTRAINT "user_favorite_player_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;