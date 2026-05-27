CREATE TYPE "public"."destruction_method" AS ENUM('shot', 'missile', 'awarded');--> statement-breakpoint
CREATE TYPE "public"."game_outcome" AS ENUM('score', 'elimination', 'draw');--> statement-breakpoint
CREATE TYPE "public"."team_result" AS ENUM('win', 'loss', 'draw');--> statement-breakpoint
CREATE TABLE "battlesuit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hardware_id" text,
	CONSTRAINT "battlesuit_center_id_name_unique" UNIQUE("center_id","name")
);
--> statement-breakpoint
CREATE TABLE "center" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" integer NOT NULL,
	"site_code" integer NOT NULL,
	"name" text DEFAULT 'Unknown Center' NOT NULL,
	"short_name" text,
	"city" text,
	"country_name" text,
	"timezone" text,
	CONSTRAINT "center_country_code_site_code_unique" UNIQUE("country_code","site_code")
);
--> statement-breakpoint
CREATE TABLE "chomper_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"s3_key" text NOT NULL,
	"status" text NOT NULL,
	"lambda_request_id" text,
	"game_id" uuid,
	"skip_reason" text,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"start_time" timestamp NOT NULL,
	"tdf_filename" text NOT NULL,
	"outcome" "game_outcome" NOT NULL,
	"scheduled_duration" integer NOT NULL,
	"actual_duration" integer NOT NULL,
	"type" text NOT NULL,
	"description" text,
	CONSTRAINT "game_center_id_start_time_unique" UNIQUE("center_id","start_time")
);
--> statement-breakpoint
CREATE TABLE "game_referee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid,
	"ipl_id" text,
	"callsign" text NOT NULL,
	"battlesuit_id" uuid,
	"hardware_id" text
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ipl_id" text NOT NULL,
	"member_id" text,
	"current_callsign" text NOT NULL,
	"first_seen_at" timestamp NOT NULL,
	CONSTRAINT "player_ipl_id_unique" UNIQUE("ipl_id")
);
--> statement-breakpoint
CREATE TABLE "player_callsign_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"callsign" text NOT NULL,
	"first_seen_at" timestamp NOT NULL,
	"last_seen_at" timestamp NOT NULL,
	CONSTRAINT "player_callsign_history_player_id_callsign_unique" UNIQUE("player_id","callsign")
);
--> statement-breakpoint
CREATE TABLE "sm5_game_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"time" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_scorecard_id" uuid,
	"target_scorecard_id" uuid,
	"target_game_target_id" uuid,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sm5_game_penalty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"referee_id" uuid,
	"scorecard_id" uuid NOT NULL,
	"score_value" integer NOT NULL,
	"description" text NOT NULL,
	"time" integer
);
--> statement-breakpoint
CREATE TABLE "sm5_game_player_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"target_scorecard_id" uuid NOT NULL,
	"shots_hit" integer NOT NULL,
	"shot_deactivations" integer NOT NULL,
	"missile_hits" integer NOT NULL,
	CONSTRAINT "sm5_game_player_interaction_unique" UNIQUE("game_id","scorecard_id","target_scorecard_id")
);
--> statement-breakpoint
CREATE TABLE "sm5_game_player_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"time" integer NOT NULL,
	"score" integer NOT NULL,
	"lives" integer NOT NULL,
	"shots" integer NOT NULL,
	"missiles" integer NOT NULL,
	"sp" integer NOT NULL,
	"hit_points" integer NOT NULL,
	"state" integer NOT NULL,
	"is_rapid_fire" boolean NOT NULL,
	"is_nuking" boolean NOT NULL,
	"accuracy" double precision NOT NULL,
	"hit_diff" double precision NOT NULL,
	CONSTRAINT "sm5_game_player_state_event_id_scorecard_id_unique" UNIQUE("event_id","scorecard_id")
);
--> statement-breakpoint
CREATE TABLE "sm5_game_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"game_team_id" uuid NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "sm5_game_target_game_id_target_id_unique" UNIQUE("game_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "sm5_game_target_destruction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_target_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"method" "destruction_method" NOT NULL,
	"time" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sm5_game_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"tdf_team_index" integer NOT NULL,
	"is_neutral" boolean NOT NULL,
	"name" text NOT NULL,
	"colour_enum" integer NOT NULL,
	"colour_rgb" text,
	"score" integer,
	"elimination_bonus" integer,
	"result" "team_result",
	"eliminated" boolean,
	CONSTRAINT "sm5_game_team_game_id_tdf_team_index_unique" UNIQUE("game_id","tdf_team_index")
);
--> statement-breakpoint
CREATE TABLE "sm5_mvp_model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"released_at" timestamp NOT NULL,
	"retired_at" timestamp,
	"description" text,
	"parameters" jsonb NOT NULL,
	CONSTRAINT "sm5_mvp_model_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "sm5_scorecard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid,
	"team_id" uuid NOT NULL,
	"battlesuit_id" uuid,
	"ipl_id" text,
	"callsign" text NOT NULL,
	"position" integer NOT NULL,
	"eliminated" boolean NOT NULL,
	"end_time" timestamp NOT NULL,
	"shots_fired" integer NOT NULL,
	"shots_hit" integer NOT NULL,
	"shots_hit_opponent" integer NOT NULL,
	"shots_hit_team" integer NOT NULL,
	"shots_hit_opponent_3hit" integer NOT NULL,
	"shots_hit_opponent_medic" integer NOT NULL,
	"shots_hit_team_medic" integer NOT NULL,
	"times_hit" integer NOT NULL,
	"missile_hits" integer NOT NULL,
	"missiles_hit_opponent" integer NOT NULL,
	"missiles_hit_team" integer NOT NULL,
	"missiles_hit_opponent_medic" integer NOT NULL,
	"missiles_hit_team_medic" integer NOT NULL,
	"times_hit_by_missile" integer NOT NULL,
	"nukes_activated" integer,
	"nukes_detonated" integer,
	"nukes_hit_medic" integer,
	"lives_removed_by_nuke" integer,
	"total_nuke_activation_time" integer,
	"average_nuke_activation_time" integer,
	"nukes_canceled" integer NOT NULL,
	"team_nukes_canceled" integer NOT NULL,
	"rapid_fire" integer,
	"total_rapid_time" integer,
	"average_rapid_time" integer,
	"shots_fired_during_rapid" integer,
	"shots_hit_during_rapid" integer,
	"shots_hit_opponent_during_rapid" integer,
	"shots_hit_team_during_rapid" integer,
	"accuracy_during_rapid" double precision,
	"ammo_boost" integer,
	"life_boost" integer,
	"resupplies_given" integer,
	"double_resupplies_given" integer,
	"resupplies_received_ammo" integer NOT NULL,
	"resupplies_received_lives" integer NOT NULL,
	"deactivated_opponent" integer NOT NULL,
	"deactivated_team" integer NOT NULL,
	"eliminated_opponent" integer NOT NULL,
	"eliminated_team" integer NOT NULL,
	"eliminated_opponent_medic" integer NOT NULL,
	"eliminated_team_medic" integer NOT NULL,
	"assists" integer NOT NULL,
	"reset_opponent" integer NOT NULL,
	"reset_team" integer NOT NULL,
	"missile_reset_opponent" integer NOT NULL,
	"missile_reset_team" integer NOT NULL,
	"sp_earned" integer,
	"sp_spent" integer,
	"targets_destroyed" integer NOT NULL,
	"penalties" integer NOT NULL,
	"lives_left" integer NOT NULL,
	"shots_left" integer NOT NULL,
	"uptime" integer NOT NULL,
	"resupply_downtime" integer NOT NULL,
	"other_downtime" integer NOT NULL,
	"score" integer NOT NULL,
	"accuracy" double precision NOT NULL,
	"hit_diff" double precision NOT NULL,
	"mvp_points" double precision NOT NULL,
	"mvp_model_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sm5_scorecard_mvp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"mvp_model_id" uuid NOT NULL,
	"component" text NOT NULL,
	"input_value" double precision NOT NULL,
	"points" double precision NOT NULL,
	CONSTRAINT "sm5_scorecard_mvp_scorecard_id_mvp_model_id_component_unique" UNIQUE("scorecard_id","mvp_model_id","component")
);
--> statement-breakpoint
CREATE TABLE "target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"hardware_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "target_center_id_hardware_id_unique" UNIQUE("center_id","hardware_id")
);
--> statement-breakpoint
ALTER TABLE "battlesuit" ADD CONSTRAINT "battlesuit_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chomper_job" ADD CONSTRAINT "chomper_job_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_referee" ADD CONSTRAINT "game_referee_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_referee" ADD CONSTRAINT "game_referee_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_referee" ADD CONSTRAINT "game_referee_battlesuit_id_battlesuit_id_fk" FOREIGN KEY ("battlesuit_id") REFERENCES "public"."battlesuit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_callsign_history" ADD CONSTRAINT "player_callsign_history_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_event" ADD CONSTRAINT "sm5_game_event_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_event" ADD CONSTRAINT "sm5_game_event_actor_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("actor_scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_event" ADD CONSTRAINT "sm5_game_event_target_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("target_scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_event" ADD CONSTRAINT "sm5_game_event_target_game_target_id_sm5_game_target_id_fk" FOREIGN KEY ("target_game_target_id") REFERENCES "public"."sm5_game_target"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_penalty" ADD CONSTRAINT "sm5_game_penalty_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_penalty" ADD CONSTRAINT "sm5_game_penalty_referee_id_game_referee_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."game_referee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_penalty" ADD CONSTRAINT "sm5_game_penalty_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_player_interaction" ADD CONSTRAINT "sm5_game_player_interaction_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_player_interaction" ADD CONSTRAINT "sm5_game_player_interaction_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_player_interaction" ADD CONSTRAINT "sm5_gpi_tgt_scorecard_id_fk" FOREIGN KEY ("target_scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_player_state" ADD CONSTRAINT "sm5_game_player_state_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_player_state" ADD CONSTRAINT "sm5_game_player_state_event_id_sm5_game_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sm5_game_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_player_state" ADD CONSTRAINT "sm5_game_player_state_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_target" ADD CONSTRAINT "sm5_game_target_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_target" ADD CONSTRAINT "sm5_game_target_target_id_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."target"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_target" ADD CONSTRAINT "sm5_game_target_game_team_id_sm5_game_team_id_fk" FOREIGN KEY ("game_team_id") REFERENCES "public"."sm5_game_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_target_destruction" ADD CONSTRAINT "sm5_gtd_game_target_id_fk" FOREIGN KEY ("game_target_id") REFERENCES "public"."sm5_game_target"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_target_destruction" ADD CONSTRAINT "sm5_gtd_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_team" ADD CONSTRAINT "sm5_game_team_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD CONSTRAINT "sm5_scorecard_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD CONSTRAINT "sm5_scorecard_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD CONSTRAINT "sm5_scorecard_team_id_sm5_game_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."sm5_game_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD CONSTRAINT "sm5_scorecard_battlesuit_id_battlesuit_id_fk" FOREIGN KEY ("battlesuit_id") REFERENCES "public"."battlesuit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD CONSTRAINT "sm5_scorecard_mvp_model_id_sm5_mvp_model_id_fk" FOREIGN KEY ("mvp_model_id") REFERENCES "public"."sm5_mvp_model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_scorecard_mvp" ADD CONSTRAINT "sm5_scorecard_mvp_scorecard_id_sm5_scorecard_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."sm5_scorecard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_scorecard_mvp" ADD CONSTRAINT "sm5_scorecard_mvp_mvp_model_id_sm5_mvp_model_id_fk" FOREIGN KEY ("mvp_model_id") REFERENCES "public"."sm5_mvp_model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target" ADD CONSTRAINT "target_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sm5_game_player_state_sc_time_idx" ON "sm5_game_player_state" USING btree ("game_id","scorecard_id","time");