-- Neutral teams whose TDF name is localized (e.g. Czech "Neutrální") were ingested as
-- competing teams: is_neutral = false, score 0, result 'loss'. Chomper now detects the
-- Neutral team structurally (last line-2 team with colour-enum 0, see apps/chomper/src/teams.ts);
-- this applies the same rule to existing rows and clears the columns that are null for Neutral.
-- Restricted to TDF-ingested games (manually created games have an empty tdf_filename and may
-- use colour 0 for a real team) and to teams with no scorecards.
UPDATE "sm5_game_team" t
SET "is_neutral" = true,
    "score" = NULL,
    "elimination_bonus" = NULL,
    "result" = NULL,
    "eliminated" = NULL,
    "penalty_score" = NULL
FROM "game" g
WHERE g."id" = t."game_id"
  AND g."tdf_filename" <> ''
  AND t."is_neutral" = false
  AND t."colour_enum" = 0
  AND t."tdf_team_index" = (
    SELECT max(x."tdf_team_index") FROM "sm5_game_team" x WHERE x."game_id" = t."game_id"
  )
  AND NOT EXISTS (SELECT 1 FROM "sm5_scorecard" s WHERE s."team_id" = t."id");
