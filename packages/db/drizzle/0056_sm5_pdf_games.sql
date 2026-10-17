CREATE TABLE "legacy_player_map" (
	"legacy_player_id" integer NOT NULL,
	"legacy_variant" integer DEFAULT 0 NOT NULL,
	"player_id" uuid NOT NULL,
	"synthetic" boolean NOT NULL,
	CONSTRAINT "legacy_player_map_legacy_player_id_legacy_variant_pk" PRIMARY KEY("legacy_player_id","legacy_variant")
);
--> statement-breakpoint
CREATE TABLE "sm5_pdf_game" (
	"game_id" uuid PRIMARY KEY NOT NULL,
	"legacy_game_id" integer NOT NULL,
	"pdf_id" text,
	"game_name" text,
	"legacy_event_id" integer,
	"legacy_match_id" integer,
	"legacy_type" text NOT NULL,
	"league_round" smallint,
	"league_match" smallint,
	"league_game" smallint,
	"legacy_winner" text,
	CONSTRAINT "sm5_pdf_game_legacy_game_id_unique" UNIQUE("legacy_game_id")
);
--> statement-breakpoint
CREATE TABLE "sm5_pdf_game_penalty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"score_value" integer NOT NULL,
	"description" text NOT NULL,
	"type" text DEFAULT 'Common Foul' NOT NULL,
	"mvp_value" double precision DEFAULT 0 NOT NULL,
	"in_game" boolean DEFAULT true NOT NULL,
	"rescinded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sm5_pdf_game_player_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"target_scorecard_id" uuid NOT NULL,
	"shots_hit" integer NOT NULL,
	"missile_hits" integer NOT NULL,
	CONSTRAINT "sm5_pdf_gpi_unique" UNIQUE("game_id","scorecard_id","target_scorecard_id")
);
--> statement-breakpoint
CREATE TABLE "sm5_pdf_game_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"side" text NOT NULL,
	"name" text NOT NULL,
	"colour_enum" integer NOT NULL,
	"score" integer NOT NULL,
	"elimination_bonus" integer NOT NULL,
	"penalty_score" integer NOT NULL,
	"result" "team_result",
	"eliminated" boolean NOT NULL,
	CONSTRAINT "sm5_pdf_game_team_game_id_side_unique" UNIQUE("game_id","side"),
	CONSTRAINT "sm5_pdf_game_team_side_check" CHECK ("sm5_pdf_game_team"."side" in ('red', 'green'))
);
--> statement-breakpoint
CREATE TABLE "sm5_pdf_game_team_penalty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"game_team_id" uuid NOT NULL,
	"score_value" integer NOT NULL,
	"description" text NOT NULL,
	"type" text DEFAULT 'Common Foul' NOT NULL,
	"rescinded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sm5_pdf_scorecard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"legacy_scorecard_id" integer NOT NULL,
	"callsign" text NOT NULL,
	"position" integer NOT NULL,
	"is_sub" boolean NOT NULL,
	"eliminated" boolean NOT NULL,
	"survived" integer,
	"shots_fired" integer NOT NULL,
	"shots_hit" integer NOT NULL,
	"shots_hit_opponent" integer NOT NULL,
	"shots_hit_team" integer NOT NULL,
	"shots_hit_opponent_3hit" integer NOT NULL,
	"times_hit" integer NOT NULL,
	"missile_hits" integer NOT NULL,
	"missiles_hit_opponent" integer NOT NULL,
	"missiles_hit_team" integer NOT NULL,
	"times_hit_by_missile" integer NOT NULL,
	"medic_hits" integer NOT NULL,
	"own_medic_hits" integer NOT NULL,
	"nukes_canceled" integer NOT NULL,
	"team_nukes_canceled" integer NOT NULL,
	"resupplies" integer NOT NULL,
	"elim_other_team" boolean NOT NULL,
	"team_elim" boolean NOT NULL,
	"nukes_activated" integer,
	"nukes_detonated" integer,
	"nukes_hit_medic" integer,
	"rapid_fire" integer,
	"ammo_boost" integer,
	"life_boost" integer,
	"sp_earned" integer,
	"sp_spent" integer,
	"targets_destroyed" integer NOT NULL,
	"penalties" integer NOT NULL,
	"lives_left" integer NOT NULL,
	"shots_left" integer NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer,
	"rank" integer NOT NULL,
	"accuracy" double precision NOT NULL,
	"hit_diff" double precision NOT NULL,
	"legacy_mvp_points" double precision NOT NULL,
	"legacy_mvp_details" jsonb,
	CONSTRAINT "sm5_pdf_scorecard_legacy_scorecard_id_unique" UNIQUE("legacy_scorecard_id")
);
--> statement-breakpoint
ALTER TABLE "legacy_player_map" ADD CONSTRAINT "legacy_player_map_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game" ADD CONSTRAINT "sm5_pdf_game_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_penalty" ADD CONSTRAINT "sm5_pdf_game_penalty_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_penalty" ADD CONSTRAINT "sm5_pdf_game_penalty_scorecard_id_sm5_pdf_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_pdf_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_player_interaction" ADD CONSTRAINT "sm5_pdf_game_player_interaction_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_player_interaction" ADD CONSTRAINT "sm5_pdf_game_player_interaction_scorecard_id_sm5_pdf_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_pdf_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_player_interaction" ADD CONSTRAINT "sm5_pdf_gpi_tgt_scorecard_id_fk" FOREIGN KEY ("target_scorecard_id") REFERENCES "public"."sm5_pdf_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_team" ADD CONSTRAINT "sm5_pdf_game_team_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_team_penalty" ADD CONSTRAINT "sm5_pdf_game_team_penalty_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_game_team_penalty" ADD CONSTRAINT "sm5_pdf_game_team_penalty_game_team_id_sm5_pdf_game_team_id_fk" FOREIGN KEY ("game_team_id") REFERENCES "public"."sm5_pdf_game_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_scorecard" ADD CONSTRAINT "sm5_pdf_scorecard_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_scorecard" ADD CONSTRAINT "sm5_pdf_scorecard_team_id_sm5_pdf_game_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."sm5_pdf_game_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_pdf_scorecard" ADD CONSTRAINT "sm5_pdf_scorecard_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_player_map_player_id_idx" ON "legacy_player_map" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_game_penalty_scorecard_id_idx" ON "sm5_pdf_game_penalty" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_game_penalty_game_id_idx" ON "sm5_pdf_game_penalty" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_gpi_scorecard_id_idx" ON "sm5_pdf_game_player_interaction" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_gpi_target_scorecard_id_idx" ON "sm5_pdf_game_player_interaction" USING btree ("target_scorecard_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_game_team_penalty_game_team_id_idx" ON "sm5_pdf_game_team_penalty" USING btree ("game_team_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_game_team_penalty_game_id_idx" ON "sm5_pdf_game_team_penalty" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_scorecard_game_id_idx" ON "sm5_pdf_scorecard" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_scorecard_team_id_idx" ON "sm5_pdf_scorecard" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "sm5_pdf_scorecard_player_id_idx" ON "sm5_pdf_scorecard" USING btree ("player_id");