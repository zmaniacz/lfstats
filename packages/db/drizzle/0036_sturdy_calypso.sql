CREATE TABLE "lb_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"linked_by" text
);
--> statement-breakpoint
CREATE TABLE "lb_match_game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"half" integer NOT NULL,
	"side1_game_team_id" uuid NOT NULL,
	"side2_game_team_id" uuid NOT NULL,
	CONSTRAINT "lb_match_game_match_id_half_unique" UNIQUE("match_id","half"),
	CONSTRAINT "lb_match_game_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
ALTER TABLE "lb_match_game" ADD CONSTRAINT "lb_match_game_match_id_lb_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."lb_match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_match_game" ADD CONSTRAINT "lb_match_game_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_match_game" ADD CONSTRAINT "lb_match_game_side1_game_team_id_lb_game_team_id_fk" FOREIGN KEY ("side1_game_team_id") REFERENCES "public"."lb_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_match_game" ADD CONSTRAINT "lb_match_game_side2_game_team_id_lb_game_team_id_fk" FOREIGN KEY ("side2_game_team_id") REFERENCES "public"."lb_game_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lb_match_game_match_id_idx" ON "lb_match_game" USING btree ("match_id");