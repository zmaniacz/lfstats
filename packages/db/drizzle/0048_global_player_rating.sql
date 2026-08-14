CREATE TABLE "player_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"rating_model_id" uuid NOT NULL,
	"rating" double precision NOT NULL,
	"standard_error" double precision,
	"rank" integer NOT NULL,
	"rating_group" integer NOT NULL,
	"games_played" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"draws" integer NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_rating_player_id_rating_model_id_unique" UNIQUE("player_id","rating_model_id")
);
--> statement-breakpoint
CREATE TABLE "sm5_rating_model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"released_at" timestamp NOT NULL,
	"retired_at" timestamp,
	"description" text,
	"parameters" jsonb NOT NULL,
	CONSTRAINT "sm5_rating_model_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "player_rating" ADD CONSTRAINT "player_rating_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_rating" ADD CONSTRAINT "player_rating_rating_model_id_sm5_rating_model_id_fk" FOREIGN KEY ("rating_model_id") REFERENCES "public"."sm5_rating_model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_rating_rank_idx" ON "player_rating" USING btree ("rank");--> statement-breakpoint
INSERT INTO "sm5_rating_model" ("version", "released_at", "description", "parameters") VALUES (
  '2026.08',
  now(),
  'Batch Bradley-Terry over a rolling 24-month window. Selected by offline bake-off: best out-of-sample log-loss among 34 candidates, and materially lower teammate-luck bias than the online Elo/Weng-Lin family because a simultaneous fit separates a player from their teammates. Margin of victory enters as a sample weight (score-based); MVP is deliberately NOT used, having failed to improve prediction in testing.',
  '{
    "algorithm": "batch-bradley-terry",
    "l2": 1.0,
    "iterations": 400,
    "learningRate": 0.05,
    "marginSource": "score",
    "marginGamma": 0.25,
    "socialWeight": 0.25,
    "windowMonths": 24,
    "minGames": 50,
    "boardSize": 100,
    "groupedHead": 25,
    "bootstrapSamples": 200
  }'::jsonb
);