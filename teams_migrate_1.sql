-- Update table definitions
-- game_teams should represent a team in any game
-- we'll store info about color
-- TEST:
-- backup prod with pg_dump
-- run drop script to backup hasura metadata and kill and recreate lfstats_test
-- restore lfstats_test with pg_restore
-- run this script
-- reimport hasura metadata


-- insert the teams
INSERT INTO game_teams (index,
                        name,
                        color_enum,
                        color_desc,
                        game_id,
                        color_normal) (SELECT 1            AS index,
                                              'Green Team' AS name,
                                              2            AS color_enum,
                                              'Green'      AS color_desc,
                                              id           AS game_id,
                                              'green'      AS color_normal
                                       FROM games)
ON CONFLICT (game_id, color_normal) DO NOTHING;

INSERT INTO game_teams (index,
                        name,
                        color_enum,
                        color_desc,
                        game_id,
                        color_normal) (SELECT 0          AS index,
                                              'Red Team' AS name,
                                              1          AS color_enum,
                                              'Red'      AS color_desc,
                                              id         AS game_id,
                                              'red'      AS color_normal FROM games)
ON CONFLICT (game_id, color_normal) DO NOTHING;

-- update elim bonuses
UPDATE game_teams
SET eliminated = CASE WHEN red_eliminated = 1 THEN TRUE ELSE FALSE END
FROM games
WHERE games.id = game_teams.game_id
  AND game_teams.color_normal = 'red';

UPDATE game_teams
SET elim_bonus = CASE WHEN green_eliminated = 1 THEN 10000 ELSE 0 END
FROM games
WHERE games.id = game_teams.game_id
  AND game_teams.color_normal = 'red';

UPDATE game_teams
SET eliminated = CASE WHEN green_eliminated = 1 THEN TRUE ELSE FALSE END
FROM games
WHERE games.id = game_teams.game_id
  AND game_teams.color_normal = 'green';

UPDATE game_teams
SET elim_bonus = CASE WHEN red_eliminated = 1 THEN 10000 ELSE 0 END
FROM games
WHERE games.id = game_teams.game_id
  AND game_teams.color_normal = 'green';

-- set rank
UPDATE game_teams
SET rank = CASE WHEN winner = 'red' THEN 1 ELSE 2 END
FROM games
WHERE games.id = game_teams.game_id
  AND game_teams.color_normal = 'red';

UPDATE game_teams
SET rank = CASE WHEN winner = 'green' THEN 1 ELSE 2 END
FROM games
WHERE games.id = game_teams.game_id
  AND game_teams.color_normal = 'green';

-- link scorecards
UPDATE scorecards
SET team_id = game_teams.id
FROM game_teams
WHERE scorecards.team = game_teams.color_normal
  AND scorecards.game_id = game_teams.game_id;

--fix teampenalties
ALTER TABLE team_penalties
    ADD team_id BIGINT;

ALTER TABLE team_penalties
    ADD CONSTRAINT team_penalties_game_teams_id_fk FOREIGN KEY (team_id) REFERENCES game_teams;

UPDATE team_penalties
SET team_id = game_teams.id
FROM game_teams
WHERE team_penalties.team_color = game_teams.color_normal;

-- fix event team IDs
UPDATE game_teams
SET event_team_id = games.red_team_id
FROM games
WHERE game_teams.game_id = games.id
  AND game_teams.color_normal = 'red'
  AND red_team_id IS NOT NULL;

UPDATE game_teams
SET event_team_id = games.green_team_id
FROM games
WHERE game_teams.game_id = games.id
  AND game_teams.color_normal = 'green'
  AND green_team_id IS NOT NULL;

-- update neutral teams
UPDATE game_teams
SET neutral_team= TRUE
WHERE color_enum = 0;

-- kill old columns
ALTER TABLE games
    DROP CONSTRAINT fk_games_teams_red_team_id;
ALTER TABLE games
    DROP CONSTRAINT fk_games_teams_green_team_id;
DROP INDEX idx_17022_red_team_id;
DROP INDEX idx_17022_green_team_id;
ALTER TABLE games
    DROP COLUMN green_team_id;
ALTER TABLE games
    DROP COLUMN red_team_id;
ALTER TABLE games
    DROP COLUMN red_score;
ALTER TABLE games
    DROP COLUMN green_score;
ALTER TABLE games
    DROP COLUMN red_adj;
ALTER TABLE games
    DROP COLUMN green_adj;
ALTER TABLE games
    DROP COLUMN winner CASCADE;
ALTER TABLE games
    DROP COLUMN red_eliminated;
ALTER TABLE games
    DROP COLUMN green_eliminated;
ALTER TABLE games
    DROP COLUMN league_round;
ALTER TABLE games
    DROP COLUMN league_match;
ALTER TABLE games
    DROP COLUMN league_game CASCADE;

DROP INDEX idx_17117_fk_team_penalties_games_id_idx;
ALTER TABLE team_penalties
    DROP CONSTRAINT fk_team_penalties_games_id;
ALTER TABLE team_penalties
    DROP COLUMN game_id;

-- no mroe extra keys on scorecards
ALTER TABLE scorecards
    DROP CONSTRAINT fk_scorecards_centers_center_id;
ALTER TABLE scorecards
    DROP CONSTRAINT fk_scorecards_events_event_id;

-- make sure we have a social tag on all social games
INSERT INTO games_tags (game_id, tag_id)
SELECT games.id, 1
FROM games
         LEFT OUTER JOIN games_tags ON games.id = games_tags.game_id
WHERE games_tags.game_id IS NULL;

-- remove social events, to be replaced with tags at a game level
-- still need to manually update ~20 events that don't match this pattern and probably need their own tags
DELETE
FROM events
WHERE is_comp = FALSE
  AND name ~* 'Socials \d\d\d\d-\d\d-\d\d';