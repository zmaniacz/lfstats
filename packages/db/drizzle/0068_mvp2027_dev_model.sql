CREATE TYPE "public"."mvp_model_status" AS ENUM('released', 'development');--> statement-breakpoint
ALTER TABLE "sm5_mvp_model" ADD COLUMN "status" "mvp_model_status" DEFAULT 'released' NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_mvp_model" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD COLUMN "ammo_boost_recipients" integer;--> statement-breakpoint
ALTER TABLE "sm5_scorecard" ADD COLUMN "life_boost_recipients" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "sm5_mvp_model_single_default_idx" ON "sm5_mvp_model" USING btree ("is_default") WHERE "sm5_mvp_model"."is_default";--> statement-breakpoint
-- 2021.12 stays the released default: it alone drives sm5_scorecard.mvp_points.
UPDATE "sm5_mvp_model" SET "is_default" = true, "status" = 'released' WHERE "version" = '2021.12';--> statement-breakpoint
-- MVP2027 (docs/MVP2027_Proposal.md, sections 4–5) as a development model. Breakdown rows
-- only; backfill existing games with `pnpm --filter chomper recalcMVP --model 2027.1-dev`.
INSERT INTO "sm5_mvp_model" ("id", "version", "released_at", "retired_at", "description", "parameters", "status", "is_default")
VALUES (
  gen_random_uuid(),
  '2027.1-dev',
  '2026-11-05 00:00:00',
  NULL,
  'MVP2027 proposal (development): per-position accuracy and score bonus, boosts per teammate reached, Scout resets, Ammo/Medic assists, Medic times reset, smaller elimination bonus',
  '{
    "universal": {
      "accuracy_points_per_percent": 0.1,
      "medic_hit_opponent_points": 1,
      "medic_hit_team_points": -1,
      "elimination_bonus_minimum": 1,
      "elimination_bonus_seconds_threshold": 0,
      "elimination_bonus_points_per_second": 0.0125,
      "nuke_cancel_opponent_points": 3,
      "nuke_cancel_team_points": -3,
      "missiled_points": -1,
      "eliminated_points": -1
    },
    "commander": {
      "accuracy_points_per_percent": 0.1,
      "medic_hit_opponent_points": 0.5,
      "missile_opponent_points": 1,
      "nuke_detonated_points": 1,
      "nuke_canceled_points": -1,
      "score_bonus_threshold": 9000,
      "score_bonus_points_per_1000": 1
    },
    "heavy": {
      "accuracy_points_per_percent": 0.1,
      "missile_opponent_points": 1,
      "score_bonus_threshold": 3500,
      "score_bonus_points_per_1000": 1
    },
    "scout": {
      "accuracy_points_per_percent": 0.05,
      "shot_3hit_points": 0.3,
      "reset_opponent_points": 0.2,
      "score_bonus_threshold": 0,
      "score_bonus_points_per_1000": 0
    },
    "ammo_carrier": {
      "accuracy_points_per_percent": 0.05,
      "ammo_boost_recipient_points": 1,
      "assist_points": 0.25,
      "score_bonus_threshold": 1500,
      "score_bonus_points_per_1000": 2
    },
    "medic": {
      "accuracy_points_per_percent": 0.1,
      "life_boost_recipient_points": 0.75,
      "times_reset_points": -0.4,
      "assist_points": 0.25,
      "survival_bonus_points": 2,
      "score_bonus_threshold": 1000,
      "score_bonus_points_per_1000": 2
    }
  }'::jsonb,
  'development',
  false
);