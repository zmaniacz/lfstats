CREATE TYPE "public"."competition_round_type" AS ENUM('pool', 'finals');--> statement-breakpoint
CREATE TABLE "competition_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"team1_id" uuid NOT NULL,
	"team2_id" uuid NOT NULL,
	"scheduled_time" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_match_game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"team1_game_team_id" uuid NOT NULL,
	"team2_game_team_id" uuid NOT NULL,
	CONSTRAINT "competition_match_game_match_id_game_number_unique" UNIQUE("match_id","game_number"),
	CONSTRAINT "competition_match_game_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "competition_round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"round_number" integer NOT NULL,
	"type" "competition_round_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_round_competition_id_round_number_unique" UNIQUE("competition_id","round_number")
);
--> statement-breakpoint
CREATE TABLE "competition_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_team_competition_id_name_unique" UNIQUE("competition_id","name")
);
--> statement-breakpoint
CREATE TABLE "competition_team_player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_team_player_competition_team_id_player_id_unique" UNIQUE("competition_team_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD COLUMN "is_mercenary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_round_id_competition_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."competition_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_team1_id_competition_team_id_fk" FOREIGN KEY ("team1_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match" ADD CONSTRAINT "competition_match_team2_id_competition_team_id_fk" FOREIGN KEY ("team2_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "competition_match_game_match_id_competition_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."competition_match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "competition_match_game_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "competition_match_game_team1_game_team_id_sm5_game_team_id_fk" FOREIGN KEY ("team1_game_team_id") REFERENCES "public"."sm5_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_match_game" ADD CONSTRAINT "competition_match_game_team2_game_team_id_sm5_game_team_id_fk" FOREIGN KEY ("team2_game_team_id") REFERENCES "public"."sm5_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_round" ADD CONSTRAINT "competition_round_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_team" ADD CONSTRAINT "competition_team_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_team_player" ADD CONSTRAINT "competition_team_player_competition_team_id_competition_team_id_fk" FOREIGN KEY ("competition_team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_team_player" ADD CONSTRAINT "competition_team_player_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;