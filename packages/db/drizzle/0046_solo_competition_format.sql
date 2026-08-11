CREATE TYPE "public"."competition_format" AS ENUM('team', 'solo');--> statement-breakpoint
CREATE TABLE "competition_player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"handicap" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_player_competition_id_player_id_unique" UNIQUE("competition_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "format" "competition_format" DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_player" ADD CONSTRAINT "competition_player_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_player" ADD CONSTRAINT "competition_player_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_player_player_id_idx" ON "competition_player" USING btree ("player_id");