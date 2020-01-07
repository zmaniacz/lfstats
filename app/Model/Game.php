<?php

class Game extends AppModel
{
    public $hasMany = [
        'Scorecard' => [
            'className' => 'Scorecard',
            'foreignKey' => 'game_id',
        ],
        'Red_Scorecard' => [
            'className' => 'Scorecard',
            'foreignKey' => 'game_id',
            'conditions' => ['Red_Scorecard.team' => 'red'],
        ],
        'Green_Scorecard' => [
            'className' => 'Scorecard',
            'foreignKey' => 'game_id',
            'conditions' => ['Green_Scorecard.team' => 'green'],
        ],
        'GameResult' => [
            'className' => 'GameResult',
            'foreignKey' => 'game_id',
        ],
        'TeamPenalties' => [
            'className' => 'TeamPenalties',
            'foreignKey' => 'game_id',
        ],
        'Red_TeamPenalties' => [
            'className' => 'TeamPenalties',
            'foreignKey' => 'game_id',
            'conditions' => ['Red_TeamPenalties.team_color' => 'red'],
        ],
        'Green_TeamPenalties' => [
            'className' => 'TeamPenalties',
            'foreignKey' => 'game_id',
            'conditions' => ['Green_TeamPenalties.team_color' => 'green'],
        ],
        'TeamDelta' => [
            'className' => 'TeamDelta',
            'foreignKey' => 'game_id',
        ],
        'GameTeam' => [
            'className' => 'GameTeam',
            'foreignKey' => 'game_id',
        ],
    ];

    public $belongsTo = [
        'Center' => [
            'className' => 'Center',
            'foreignKey' => 'center_id',
        ],
        'Red_Team' => [
            'className' => 'EventTeam',
            'foreignKey' => 'red_team_id',
        ],
        'Green_Team' => [
            'className' => 'EventTeam',
            'foreignKey' => 'green_team_id',
        ],
        'Match' => [
            'className' => 'Match',
            'foreignKey' => 'match_id',
        ],
        'Event' => [
            'className' => 'Event',
            'foreignKey' => 'event_id',
        ],
    ];

    public $validate = [
        'game_datetime' => [
            'rule' => ['isUnique', ['game_datetime', 'center_id'], false],
            'message' => 'Non-Unique center/game combination',
        ],
    ];

    public function getOverallStats($state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Game.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Game.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Game.event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'fields' => [
                'winner',
                'red_eliminated',
                'green_eliminated',
                'COUNT(game_datetime) as total',
                'AVG(red_score) as red_avg_score',
                'AVG(green_score) as green_avg_score',
            ],
            'conditions' => $conditions,
            'group' => [
                'winner',
                'red_eliminated',
                'green_eliminated',
            ],
        ]);
    }

    public function getGameDetails($id)
    {
        $conditions[] = ['Game.id' => $id];

        return $this->find('first', [
            'contain' => [
                'Scorecard' => [
                    'Penalty',
                    'Hit',
                ],
                'Match' => [
                    'Round',
                ],
                'Red_Scorecard' => [
                    'fields' => [
                        'SUM(medic_hits) as medic_hits',
                        'SUM(missile_hits) as missile_hits',
                        'SUM(nukes_detonated) as nukes_detonated',
                        'SUM(lives_left) as lives_left',
                        'SUM(shots_left) as shots_left',
                        '( SUM(shot_opponent) / SUM(times_zapped) ) as hit_diff',
                        'SUM(resupplies) as resupplies',
                        'SUM(bases_destroyed) as bases_destroyed',
                        'AVG(accuracy) as accuracy',
                        'SUM(mvp_points) as mvp_points',
                    ],
                ],
                'Green_Scorecard' => [
                    'fields' => [
                        'SUM(medic_hits) as medic_hits',
                        'SUM(missile_hits) as missile_hits',
                        'SUM(nukes_detonated) as nukes_detonated',
                        'SUM(lives_left) as lives_left',
                        'SUM(shots_left) as shots_left',
                        '( SUM(shot_opponent) / SUM(times_zapped) ) as hit_diff',
                        'SUM(resupplies) as resupplies',
                        'SUM(bases_destroyed) as bases_destroyed',
                        'AVG(accuracy) as accuracy',
                        'SUM(mvp_points) as mvp_points',
                    ],
                ],
                'Red_TeamPenalties',
                'Green_TeamPenalties',
            ],
            'conditions' => $conditions,
        ]);
    }

    public function getMatchups($id)
    {
        $conditions[] = ['Game.id' => $id];

        $red_team = $this->find('first', [
            'fields' => ['id'],
            'contain' => [
                'Red_Scorecard' => [
                    'fields' => [
                        'player_id',
                        'player_name',
                        'position',
                        'mvp_points',
                    ],
                    'order' => 'position ASC, mvp_points DESC',
                ],
            ],
            'conditions' => $conditions,
        ]);

        $green_team = $this->find('first', [
            'fields' => ['id'],
            'contain' => [
                'Green_Scorecard' => [
                    'fields' => [
                        'player_id',
                        'player_name',
                        'position',
                        'mvp_points',
                    ],
                    'order' => 'position ASC, mvp_points DESC',
                ],
            ],
            'conditions' => $conditions,
        ]);

        $scout_counter = 1;
        foreach ($red_team['Red_Scorecard'] as &$score) {
            if ('Scout' == $score['position']) {
                $score['position'] = 'Scout'.$scout_counter;
                ++$scout_counter;
            }
        }

        $scout_counter = 1;
        foreach ($green_team['Green_Scorecard'] as &$score) {
            if ('Scout' == $score['position']) {
                $score['position'] = 'Scout'.$scout_counter;
                ++$scout_counter;
            }
        }
        $data = [];
        foreach ($red_team['Red_Scorecard'] as $red_score) {
            foreach ($green_team['Green_Scorecard'] as $green_score) {
                if ($red_score['position'] == $green_score['position']) {
                    $data[] = [
                        'position' => $red_score['position'],
                        'red_player_id' => $red_score['player_id'],
                        'red_player_name' => $red_score['player_name'],
                        'green_player_id' => $green_score['player_id'],
                        'green_player_name' => $green_score['player_name'],
                        'matchup' => $this->Scorecard->getComparison($red_score['player_id'], $green_score['player_id']),
                    ];
                }
            }
        }

        return $data;
    }

    public function getGameList($date = null, $state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Game.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Game.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Game.event_id' => $state['leagueID']];
        }

        if (!is_null($date)) {
            $conditions[] = ['DATE(Game.game_datetime)' => $date];
        }

        return $this->find('all', [
            'contain' => [
                'Red_Team',
                'Green_Team',
                'Match' => [
                    'Round',
                ],
            ],
            'conditions' => $conditions,
            'order' => 'Game.game_datetime ASC',
        ]);
    }

    public function updateGameWinner($id)
    {
        $scores = $this->find('first', [
            'fields' => [
                'Game.id',
            ],
            'contain' => [
                'Scorecard' => [
                    'fields' => [
                        'score',
                        'team_elim',
                        'team',
                        'survived',
                    ],
                    'Penalty',
                ],
                'Red_TeamPenalties',
                'Green_TeamPenalties',
            ],
            'conditions' => [
                'Game.id' => $id,
            ],
        ]);

        if (count($scores['Scorecard']) < 1) {
            //This is a manually edited game with no scorecards and we're going to skip it
            return;
        }

        $elim_bonus = 10000;
        $red_raw = 0;
        $red_bonus = 0;
        $red_pens = 0;
        $red_team_pens = 0;
        $red_elim = 0;
        $green_raw = 0;
        $green_bonus = 0;
        $green_pens = 0;
        $green_team_pens = 0;
        $green_elim = 0;
        $winner = 'green';
        $max_time = 0;

        foreach ($scores['Scorecard'] as $scorecard) {
            if ('red' == $scorecard['team']) {
                $red_raw += $scorecard['score'];
                $red_elim += $scorecard['team_elim'];
            } else {
                $green_raw += $scorecard['score'];
                $green_elim += $scorecard['team_elim'];
            }

            $max_time = max($max_time, $scorecard['survived']);

            if (!empty($scorecard['Penalty'])) {
                foreach ($scorecard['Penalty'] as $penalty) {
                    if ('red' == $scorecard['team']) {
                        $red_pens += $penalty['value'];
                    } else {
                        $green_pens += $penalty['value'];
                    }
                }
            }
        }

        //Apply the elim bonus if the opposing team was eliminated...both teams can get the bonus
        if ($red_elim > 0) {
            $green_bonus += $elim_bonus;
            $red_elim = 1;
        }

        if ($green_elim > 0) {
            $red_bonus += $elim_bonus;
            $green_elim = 1;
        }

        //load team penalties in
        foreach ($scores['Red_TeamPenalties'] as $team_penalty) {
            $red_team_pens += $team_penalty['value'];
        }

        foreach ($scores['Green_TeamPenalties'] as $team_penalty) {
            $green_team_pens += $team_penalty['value'];
        }

        //calc the scores and assign the winner
        if ($red_raw + $red_bonus + $red_pens + $red_team_pens > $green_raw + $green_bonus + $green_pens + $green_team_pens) {
            $winner = 'red';
        } else {
            $winner = 'green';
        }

        //force an elim to equal a win
        if ($red_elim > 0) {
            $winner = 'green';
        }

        if ($green_elim > 0) {
            $winner = 'red';
        }

        //max time validation
        if ($max_time <= 0) {
            $max_time = null;
        }

        $data = ['id' => $id,
            'green_score' => $green_raw,
            'red_score' => $red_raw,
            'red_adj' => $red_bonus + $red_pens + $red_team_pens,
            'green_adj' => $green_bonus + $green_pens + $green_team_pens,
            'red_eliminated' => $red_elim,
            'green_eliminated' => $green_elim,
            'winner' => $winner,
            'game_length' => $max_time,
        ];

        $this->save($data);

        $game = $this->find('first', [
            'contain' => [
                'Match',
            ],
            'conditions' => [
                'Game.id' => $id,
            ],
        ]);

        if (isset($game['Match']['id'])) {
            $this->Match->updatePoints($game['Match']['id']);
        }
    }

    public function getPrevNextGame($game_id)
    {
        $game = $this->findById($game_id);

        if ('league' == $game['Game']['type'] || 'tournament' == $game['Game']['type']) {
            App::import('Model', 'LeagueGame');
            $leagueGame = new LeagueGame();
            $results = $leagueGame->getPrevNextGame($game_id, $game['Game']['event_id']);

            $results = array_map(function ($position) {
                if (isset($position['LeagueGame'])) {
                    return [
                        'Game' => $position['LeagueGame'],
                    ];
                }
            }, $results);
        } else {
            $results = $this->find('neighbors', [
                'field' => 'id',
                'value' => $game_id,
                'order' => 'game_datetime DESC',
            ]);

            $results = array_map(function ($position) {
                if (isset($position['Game'])) {
                    $position['Game']['game_id'] = $position['Game']['id'];

                    return $position;
                }
            }, $results);
        }

        return $results;
    }

    public function getDatabaseStats()
    {
        return $this->find('first', [
            'fields' => [
                'COUNT(id) as total_games',
            ],
        ]);
    }

    public function fixSocialGameNames($date, $center_id)
    {
        //christ
        $games = $this->find('all', [
            'conditions' => [
                'center_id' => $center_id,
                'DATE(game_datetime)' => $date,
            ],
            'order' => 'game_datetime ASC',
        ]);

        $game_counter = 1;
        foreach ($games as $game) {
            $game['Game']['game_name'] = "G{$game_counter}";
            $this->save($game);
            ++$game_counter;
        }
    }

    public function getGameScoreChartData($id)
    {
        return $this->find('first', [
            'contain' => ['GameTeam', 'TeamDelta'],
            'conditions' => ['id' => $id],
        ]);
    }
}
