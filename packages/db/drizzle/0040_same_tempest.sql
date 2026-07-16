CREATE TABLE "sm5_game_team_penalty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"game_team_id" uuid NOT NULL,
	"referee_id" uuid,
	"score_value" integer NOT NULL,
	"description" text NOT NULL,
	"time" integer,
	"type" text DEFAULT 'Common Foul' NOT NULL,
	"in_game" boolean DEFAULT true NOT NULL,
	"rescinded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sm5_game_team_penalty" ADD CONSTRAINT "sm5_game_team_penalty_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_team_penalty" ADD CONSTRAINT "sm5_game_team_penalty_game_team_id_sm5_game_team_id_fk" FOREIGN KEY ("game_team_id") REFERENCES "public"."sm5_game_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sm5_game_team_penalty" ADD CONSTRAINT "sm5_game_team_penalty_referee_id_game_referee_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."game_referee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sm5_game_team_penalty_game_team_id_idx" ON "sm5_game_team_penalty" USING btree ("game_team_id");--> statement-breakpoint
CREATE INDEX "sm5_game_team_penalty_game_id_idx" ON "sm5_game_team_penalty" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sm5_game_team_penalty_referee_id_idx" ON "sm5_game_team_penalty" USING btree ("referee_id");