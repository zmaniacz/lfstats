ALTER TABLE "sm5_game_team" ADD COLUMN "penalty_score" integer;
--> statement-breakpoint
UPDATE "sm5_game_team" gt
SET "penalty_score" = COALESCE((
  SELECT SUM(p.score_value)
  FROM "sm5_game_penalty" p
  INNER JOIN "sm5_scorecard" sc ON sc.id = p.scorecard_id
  WHERE sc.team_id = gt.id AND p.rescinded = false
), 0)
WHERE gt.is_neutral = false;