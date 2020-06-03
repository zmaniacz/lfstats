-- Update table definitions
-- game_teams should represent a team in any game
-- we'll store info about color
ALTER TABLE public.game_teams
    ADD COLUMN elim_bonus INTEGER DEFAULT 0;

ALTER TABLE public.game_teams
    ADD COLUMN adjustment INTEGER DEFAULT 0;

ALTER TABLE public.game_teams
    ADD COLUMN rank SMALLINT;

ALTER TABLE public.game_teams
    ADD COLUMN eliminated BOOLEAN;

ALTER TABLE public.game_teams
    ADD COLUMN event_team_id BIGINT;
ALTER TABLE public.game_teams
    ADD FOREIGN KEY (event_team_id) REFERENCES public.event_teams (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.game_teams
    ADD UNIQUE (game_id, color_normal);

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

-- TODO fix event team IDs
