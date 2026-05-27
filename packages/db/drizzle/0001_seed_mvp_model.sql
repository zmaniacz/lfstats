INSERT INTO sm5_mvp_model (id, version, released_at, retired_at, description, parameters)
VALUES (
  gen_random_uuid(),
  '2021.12',
  '2021-12-01 00:00:00',
  NULL,
  'Initial MVP formula',
  '{
    "universal": {
      "accuracy_points_per_percent": 0.1,
      "medic_hit_opponent_points": 1,
      "medic_hit_team_points": -1,
      "elimination_bonus_minimum": 4,
      "elimination_bonus_seconds_threshold": 180,
      "elimination_bonus_points_per_second": 0.016667,
      "nuke_cancel_opponent_points": 3,
      "nuke_cancel_team_points": -3,
      "missiled_points": -1,
      "eliminated_points": -1
    },
    "commander": {
      "missile_opponent_points": 1,
      "nuke_detonated_points": 1,
      "nuke_canceled_points": -1,
      "score_bonus_threshold": 10000,
      "score_bonus_points_per_1000": 1
    },
    "heavy": {
      "missile_opponent_points": 2,
      "score_bonus_threshold": 7000,
      "score_bonus_points_per_1000": 1
    },
    "scout": {
      "shot_3hit_points": 0.2,
      "score_bonus_threshold": 6000,
      "score_bonus_points_per_1000": 1
    },
    "ammo_carrier": {
      "ammo_boost_points": 3,
      "score_bonus_threshold": 3000,
      "score_bonus_points_per_1000": 1
    },
    "medic": {
      "life_boost_points": 3,
      "survival_bonus_points": 2,
      "score_bonus_threshold": 2000,
      "score_bonus_points_per_1000": 2
    }
  }'::jsonb
);
