CREATE TYPE "public"."competition_type" AS ENUM('competitive', 'social');--> statement-breakpoint
CREATE TABLE "competition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "competition_type" NOT NULL,
	"host_center_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"description" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_tag_center_id_name_unique" UNIQUE("center_id","name")
);
--> statement-breakpoint
CREATE TABLE "game_tag_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_tag_assignment_game_id_tag_id_unique" UNIQUE("game_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user_favorite_game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_game_user_id_game_id_unique" UNIQUE("user_id","game_id")
);
--> statement-breakpoint
ALTER TABLE "game" ADD COLUMN "competition_id" uuid;--> statement-breakpoint
ALTER TABLE "game" ADD COLUMN "exclude" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_host_center_id_center_id_fk" FOREIGN KEY ("host_center_id") REFERENCES "public"."center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tag" ADD CONSTRAINT "game_tag_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tag_assignment" ADD CONSTRAINT "game_tag_assignment_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tag_assignment" ADD CONSTRAINT "game_tag_assignment_tag_id_game_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."game_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_game" ADD CONSTRAINT "user_favorite_game_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_game" ADD CONSTRAINT "user_favorite_game_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE set null ON UPDATE no action;