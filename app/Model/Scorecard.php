<?php

class Scorecard extends AppModel
{
    public $belongsTo = [
        'Player' => [
            'className' => 'Player',
            'foreignKey' => 'player_id',
        ],
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'game_id',
        ],
        'GameTeam' => [
            'className' => 'GameTeam',
            'foreignKey' => 'game_id',
        ],
    ];

    public $hasOne = [
        'GameResult' => [
            'className' => 'GameResult',
            'foreignKey' => 'scorecard_id',
        ],
    ];

    public $hasMany = [
        'Penalty' => [
            'className' => 'Penalty',
            'foreignKey' => 'scorecard_id',
        ],
        'Hit' => [
            'className' => 'Hit',
            'foreignKey' => 'scorecard_id',
        ],
    ];

    public $validate = [
        'player_name' => [
            'on' => 'create',
            'rule' => ['uniqueScorecard'],
            'message' => 'Non-Unique player/game combination',
        ],
    ];

    public function uniqueScorecard($player_name)
    {
        $count = $this->find('count', [
            'conditions' => [
                'player_name' => $player_name,
                'game_datetime' => $this->data[$this->alias]['game_datetime'],
            ],
        ]);

        return 0 == $count;
    }

    public function generateMaxScore($id)
    {
        $scorecard = $this->find('first', ['conditions' => ['Scorecard.id' => $id]]);

        $max = 0;

        $max += $scorecard['Scorecard']['shot_opponent'] * 100;
        $max += $scorecard['Scorecard']['missiled_opponent'] * 500;
        $max += $scorecard['Scorecard']['bases_destroyed'] * 1001;
        $max += $scorecard['Scorecard']['nukes_activated'] * 500;

        $scorecard['Scorecard']['max_score'] = $max;

        $this->save($scorecard);
    }

    public function generateMVP($game_id)
    {
        $scores = $this->find('all', [
            'conditions' => [
                'Scorecard.game_id' => $game_id,
            ],
            'contain' => [
                'Game',
            ],
        ]);

        foreach ($scores as $score) {
            $mvp_details = [
                'positionBonus' => [
                    'name' => 'Position Score Bonus',
                    'value' => 0,
                ],
                'missiledOpponent' => [
                    'name' => 'Missiled Opponent',
                    'value' => 0,
                ],
                'acc' => [
                    'name' => 'Accuracy',
                    'value' => 0,
                ],
                'nukesDetonated' => [
                    'name' => 'Nukes Detonated',
                    'value' => 0,
                ],
                'nukesCanceled' => [
                    'name' => 'Nukes Canceled',
                    'value' => 0,
                ],
                'medicHits' => [
                    'name' => 'Medic Hits',
                    'value' => 0,
                ],
                'ownMedicHits' => [
                    'name' => 'Own Medic Hits',
                    'value' => 0,
                ],
                /*'rapidFire' => [
                    'name' => 'Activate Rapid Fire',
                    'value' => 0,
                ],*/
                'shoot3Hit' => [
                    'name' => 'Shoot 3-Hit',
                    'value' => 0,
                ],
                'ammoBoost' => [
                    'name' => 'Ammo Boost',
                    'value' => 0,
                ],
                'lifeBoost' => [
                    'name' => 'Life Boost',
                    'value' => 0,
                ],
                'medicSurviveBonus' => [
                    'name' => 'Medic Survival Bonus',
                    'value' => 0,
                ],
                'medicScoreBonus' => [
                    'name' => 'Medic Score Bonus',
                    'value' => 0,
                ],
                'elimBonus' => [
                    'name' => 'Elimination Bonus',
                    'value' => 0,
                ],
                'timesMissiled' => [
                    'name' => 'Times Missiled',
                    'value' => 0,
                ],
                'missiledTeam' => [
                    'name' => 'Missiled Team',
                    'value' => 0,
                ],
                'ownNukesCanceled' => [
                    'name' => 'Your Nukes Canceled',
                    'value' => 0,
                ],
                'teamNukesCanceled' => [
                    'name' => 'Team Nukes Canceled',
                    'value' => 0,
                ],
                'elimPenalty' => [
                    'name' => 'Elimination Penalty',
                    'value' => 0,
                ],
                'penalties' => [
                    'name' => 'Penalties',
                    'value' => 0,
                ],
            ];

            $mvp = 0;

            //Position based point bonus
            switch ($score['Scorecard']['position']) {
                case 'Ammo Carrier':
                    $mvp_details['positionBonus']['value'] += max((floor(($score['Scorecard']['score'] - 3000) / 10) * .01), 0);

                    break;
                case 'Commander':
                    $mvp_details['positionBonus']['value'] += max((floor(($score['Scorecard']['score'] - 10000) / 10) * .01), 0);

                    break;
                case 'Heavy Weapons':
                    $mvp_details['positionBonus']['value'] += max((floor(($score['Scorecard']['score'] - 7000) / 10) * .01), 0);

                    break;
                case 'Medic':
                    $mvp_details['positionBonus']['value'] += max((floor(($score['Scorecard']['score'] - 2000) / 10) * .02), 0);

                    break;
                case 'Scout':
                    $mvp_details['positionBonus']['value'] += max((floor(($score['Scorecard']['score'] - 6000) / 10) * .01), 0);

                    break;
            }

            //medic bonus point - removed on 2020-02-22
            /*if ('Medic' == $score['Scorecard']['position'] && $score['Scorecard']['score'] >= 3000) {
                ++$mvp_details['medicScoreBonus']['value'];
            }*/

            //accuracy bonus
            $mvp_details['acc']['value'] += round($score['Scorecard']['accuracy'] * 10, 1);

            //don't get missiled dummy
            $mvp_details['timesMissiled']['value'] += $score['Scorecard']['times_missiled'] * -1;

            //missile other people instead
            switch ($score['Scorecard']['position']) {
                case 'Commander':
                    $mvp_details['missiledOpponent']['value'] += $score['Scorecard']['missiled_opponent'];

                    break;
                case 'Heavy Weapons':
                    $mvp_details['missiledOpponent']['value'] += $score['Scorecard']['missiled_opponent'] * 2;

                    break;
            }

            //get dat 5-chain
            $mvp_details['nukesDetonated']['value'] += $score['Scorecard']['nukes_detonated'];

            //maybe hide better
            if ($score['Scorecard']['nukes_activated'] - $score['Scorecard']['nukes_detonated'] > 0) {
                $conditions = [];

                $conditions[] = ['game_id' => $score['Scorecard']['game_id']];

                if ('red' == $score['Scorecard']['team']) {
                    $conditions[] = ['team' => 'green'];
                } else {
                    $conditions[] = ['team' => 'red'];
                }

                $nukes = $this->find(
                    'all',
                    [
                        'fields' => [
                            'SUM(nukes_canceled) AS all_nukes_canceled',
                        ],
                        'conditions' => $conditions,
                    ]
                );

                if ($nukes[0][0]['all_nukes_canceled'] > 0) {
                    $mvp_details['ownNukesCanceled']['value'] += (int) $nukes[0][0]['all_nukes_canceled'] * -1;
                }
            }

            //make commanders cry
            $mvp_details['nukesCanceled']['value'] += $score['Scorecard']['nukes_canceled'] * 3;

            //medic tears are scrumptious
            $mvp_details['medicHits']['value'] += $score['Scorecard']['medic_hits'];

            //dont be a venom
            $mvp_details['ownMedicHits']['value'] += $score['Scorecard']['own_medic_hits'] * -1;

            //push the little button
            //$mvp_details['rapidFire']['value'] += $score['Scorecard']['scout_rapid'] * .5;
            $mvp_details['lifeBoost']['value'] += $score['Scorecard']['life_boost'] * 3;
            $mvp_details['ammoBoost']['value'] += $score['Scorecard']['ammo_boost'] * 3;

            //survival bonuses/penalties
            if ($score['Scorecard']['lives_left'] > 0 && 'Medic' == $score['Scorecard']['position']) {
                $mvp_details['medicSurviveBonus']['value'] += 2;
            }

            if ($score['Scorecard']['lives_left'] <= 0 && 'Medic' != $score['Scorecard']['position']) {
                $mvp_details['elimPenalty']['value'] += -1;
            }

            //apply penalties based on value of the penalty
            $penalties = $this->Penalty->find('all', [
                'conditions' => [
                    'scorecard_id' => $score['Scorecard']['id'],
                ],
            ]);

            foreach ($penalties as $penalty) {
                if ('Penalty Removed' != $penalty['Penalty']['type']) {
                    $mvp_details['penalties']['value'] += $penalty['Penalty']['mvp_value'];
                }
            }

            //raping 3hits.  the math looks weird, but it works and gets the desired result
            $mvp_details['shoot3Hit']['value'] += floor(($score['Scorecard']['shot_3hit'] / 5) * 100) / 100;

            //No.  Stahp.
            $mvp_details['teamNukesCanceled']['value'] += $score['Scorecard']['own_nuke_cancels'] * -3;

            //more venom points
            $mvp_details['missiledTeam']['value'] += $score['Scorecard']['missiled_team'] * -3;

            //WINNER
            //at least 1 MVP for an elim, increased by 1/60 for each second of time remaining over 60
            if ($score['Scorecard']['elim_other_team'] > 0) {
                if (!is_null($score['Game']['game_length'])) {
                    $mvp_details['elimBonus']['value'] += round(max(1, (($score['Game']['duration'] - $score['Game']['game_length']) / 60)), 2);
                } else {
                    //default to 2
                    $mvp_details['elimBonus']['value'] += $score['Scorecard']['elim_other_team'] * 2;
                }
            }

            foreach ($mvp_details as $item) {
                $mvp += $item['value'];
            }
            $score['Scorecard']['mvp_points'] = max(round($mvp, 2), 0);
            $score['Scorecard']['mvp_details'] = json_encode($mvp_details);

            $this->save($score);
        }
    }

    public function generateGames()
    {
        App::uses('Sanitize', 'Utility');
        $counter = 0;

        $scores = $this->query(
            "SELECT green.game_datetime, green.type, green.score, red.score, green.team_elim, red.team_elim, green.pdf_id, green.event_id, green.center_id
			FROM (
				SELECT game_datetime, type, pdf_id, event_id, center_id, SUM(score) AS score, SUM(team_elim) AS team_elim
				FROM scorecards 
				WHERE team = 'green' AND game_id IS NULL
				GROUP BY game_datetime
			) AS green,
			(
				SELECT game_datetime, SUM(score) AS score, SUM(team_elim) AS team_elim
				FROM scorecards
				WHERE team = 'red' AND game_id IS NULL
				GROUP BY game_datetime
			) AS red
			WHERE green.game_datetime = red.game_datetime 
			ORDER BY green.game_datetime"
        );

        $current_date = 0;
        $date = 0;
        $game_counter = 0;

        foreach ($scores as $score) {
            $date = date('Y-m-d', strtotime($score['green']['game_datetime']));
            if ($current_date == $date) {
                ++$game_counter;
            } else {
                $game_counter = 1;
                $current_date = $date;
            }

            $this->Game->create();
            $this->Game->set([
                'game_name' => "G{$game_counter}",
                'game_description' => '',
                'game_datetime' => $score['green']['game_datetime'],
                'type' => $score['green']['type'],
                'pdf_id' => $score['green']['pdf_id'],
                'event_id' => $score['green']['event_id'],
                'center_id' => $score['green']['center_id'],
            ]);
            $this->Game->save();

            $this->updateAll(
                ['Scorecard.game_id' => '"' . $this->Game->id . '"'],
                ['Scorecard.game_datetime' => $score['green']['game_datetime']]
            );

            $this->Game->updateGameWinner($this->Game->id);

            ++$counter;
        }

        return $counter;
    }

    public function generatePlayers()
    {
        $scores = $this->find('all', ['conditions' => ['Scorecard.player_id' => null]]);
        $players = $this->Player->PlayersName->find('all');
        $results = ['new' => 0, 'existing' => 0];

        foreach ($scores as $score) {
            $found = false;
            foreach ($players as $key => $val) {
                if (0 == strcasecmp($score['Scorecard']['player_name'], $val['PlayersName']['player_name'])) {
                    $score['Scorecard']['player_id'] = $val['PlayersName']['player_id'];
                    $this->save($score);
                    ++$results['existing'];
                    $found = true;

                    break;
                }
            }

            if (!$found) {
                $this->Player->Create();
                $this->Player->set([
                    'player_name' => $score['Scorecard']['player_name'],
                ]);
                $this->Player->save();

                $score['Scorecard']['player_id'] = $this->Player->id;
                $this->save($score);

                $this->Player->PlayersName->Create();
                $this->Player->PlayersName->set([
                    'player_id' => $this->Player->id,
                    'player_name' => $score['Scorecard']['player_name'],
                ]);
                $this->Player->PlayersName->save();

                ++$results['new'];

                $players = $this->Player->PlayersName->find('all');
            }
        }

        return $results;
    }

    public function generatePlayer($player_name)
    {
        $player = $this->Player->PlayersName->findByPlayerName($player_name);

        if (empty($player)) {
            $this->Player->Create();
            $this->Player->set([
                'player_name' => $player_name,
            ]);
            $this->Player->save();

            $this->Player->PlayersName->Create();
            $this->Player->PlayersName->set([
                'player_id' => $this->Player->id,
                'player_name' => $player_name,
            ]);
            $this->Player->PlayersName->save();

            return $this->Player->id;
        }

        return $player['PlayersName']['player_id'];
    }

    public function getMVPDetailsBySource($state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        $fields = [
            'AVG(CAST(mvp_details -> \'positionBonus\' ->> \'value\' AS FLOAT)) as position_bonus',
            'AVG(CAST(mvp_details -> \'missiledOpponent\' ->> \'value\' AS INTEGER)) as missiled_opponent',
            'AVG(CAST(mvp_details -> \'acc\' ->> \'value\' AS FLOAT)) as acc',
            'AVG(CAST(mvp_details -> \'nukesDetonated\' ->> \'value\' AS INTEGER)) as nukes_detonated',
            'AVG(CAST(mvp_details -> \'nukesCanceled\' ->> \'value\' AS INTEGER)) as nukes_canceled',
            'AVG(CAST(mvp_details -> \'medicHits\' ->> \'value\' AS INTEGER)) as medic_hits',
            'AVG(CAST(mvp_details -> \'ownMedicHits\' ->> \'value\' AS INTEGER)) as own_medic_hits',
            'AVG(CAST(mvp_details -> \'rapidFire\' ->> \'value\' AS FLOAT)) as rapid_fire',
            'AVG(CAST(mvp_details -> \'shoot3Hit\' ->> \'value\' AS FLOAT)) as shoot_3_hit',
            'AVG(CAST(mvp_details -> \'ammoBoost\' ->> \'value\' AS INTEGER)) as ammo_boost',
            'AVG(CAST(mvp_details -> \'lifeBoost\' ->> \'value\' AS INTEGER)) as life_boost',
            'AVG(CAST(mvp_details -> \'medicSurviveBonus\' ->> \'value\' AS INTEGER)) as medic_survive_bonus',
            'AVG(CAST(mvp_details -> \'medicScoreBonus\' ->> \'value\' AS INTEGER)) as medic_score_bonus',
            'AVG(CAST(mvp_details -> \'elimBonus\' ->> \'value\' AS FLOAT)) as elim_bonus',
            'AVG(CAST(mvp_details -> \'timesMissiled\' ->> \'value\' AS INTEGER)) as times_missiled',
            'AVG(CAST(mvp_details -> \'missiledTeam\' ->> \'value\' AS INTEGER)) as missiled_team',
            'AVG(CAST(mvp_details -> \'ownNukesCanceled\' ->> \'value\' AS INTEGER)) as own_nukes_canceled',
            'AVG(CAST(mvp_details -> \'teamNukesCanceled\' ->> \'value\' AS INTEGER)) as team_nukes_canceled',
            'AVG(CAST(mvp_details -> \'elimPenalty\' ->> \'value\' AS INTEGER)) as elim_penalty',
            'AVG(CAST(mvp_details -> \'penalties\' ->> \'value\' AS FLOAT)) as penalties',
        ];

        $positions = $this->find('all', [
            'fields' => array_merge($fields, ['Scorecard.position']),
            'conditions' => $conditions,
            'group' => 'Scorecard.position',
        ]);

        $all = $this->find('all', [
            'fields' => $fields,
            'conditions' => $conditions,
        ]);

        $data = [];
        $data['all'] = $all[0][0];
        foreach ($positions as $result) {
            $data[$result['Scorecard']['position']] = $result[0];
        }

        return $data;
    }

    public function getGameDates($state)
    {
        $conditions[] = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        $game_dates = $this->find('all', [
            'fields' => ['DISTINCT DATE(Scorecard.game_datetime) as game_date'],
            'order' => 'game_date DESC',
            'conditions' => $conditions,
        ]);

        return Set::combine($game_dates, '{n}.0.game_date', '{n}.0.game_date');
    }

    public function getScorecardsByDate($date, $state)
    {
        $conditions = [];

        if (!is_null($date)) {
            $conditions[] = ["Scorecard.game_datetime BETWEEN ('{$date}'::timestamptz AT TIME ZONE 'UTC') AND ('{$date}'::timestamptz AT TIME ZONE 'UTC') + INTERVAL '1 day'"];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'conditions' => $conditions,
            'contain' => [
                'Game' => [],
            ],
        ]);
    }

    public function getScorecardsByDateRange($start, $end, $state)
    {
        $conditions = [];

        $conditions[] = ["Scorecard.game_datetime BETWEEN ('{$start}'::timestamptz AT TIME ZONE 'UTC') AND ('{$end}'::timestamptz AT TIME ZONE 'UTC')"];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'conditions' => $conditions,
        ]);
    }

    public function getNightlyStatsByDate($date, $state)
    {
        $conditions = [];

        if (!is_null($date)) {
            $conditions[] = ['DATE(Scorecard.game_datetime)' => $date];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'fields' => [
                'player_id',
                'MIN(Scorecard.score) as min_score',
                'ROUND(AVG(Scorecard.score)) as avg_score',
                'MAX(Scorecard.score) as max_score',
                'MIN(Scorecard.mvp_points) as min_mvp',
                'AVG(Scorecard.mvp_points) as avg_mvp',
                'MAX(Scorecard.mvp_points) as max_mvp',
                'AVG(Scorecard.accuracy) as avg_acc',
                '(SUM(Scorecard.shot_opponent)/GREATEST(SUM(Scorecard.times_zapped),1.0)) as hit_diff',
                'SUM(Scorecard.medic_hits) as medic_hits',
                '(SUM(Scorecard.team_elim)::DECIMAL/COUNT(Scorecard.game_datetime)::DECIMAL) as elim_rate',
                'COUNT(Scorecard.game_datetime) as games_played',
                'SUM(GameResult.won) as games_won',
            ],
            'contain' => [
                'Player' => [
                    'fields' => ['id', 'player_name'],
                ],
            ],
            'joins' => [
                [
                    'table' => 'game_results',
                    'alias' => 'GameResult',
                    'type' => 'LEFT',
                    'conditions' => [
                        'GameResult.scorecard_id = Scorecard.id',
                    ],
                ],
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Player.id',
            'order' => 'avg_mvp DESC',
        ]);
    }

    public function getComparableMVP($player_id)
    {
        $results = $this->find('all', [
            'fields' => [
                'player_id',
                'position',
                'AVG(mvp_points) as avg_mvp',
            ],
            'conditions' => [
                'player_id' => $player_id,
            ],
            'group' => 'player_id, position',
            'order' => 'position ASC',
        ]);

        $data = [];
        foreach ($results as $result) {
            $data[] = (float) $result[0]['avg_mvp'];
        }

        return $data;
    }

    public function getPositionStats($role = null, $state = null)
    {
        $conditions = [];
        $min_games = null;

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (!is_null($role)) {
            $conditions[] = ['Scorecard.position' => $role];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if ($state['scoring'] == "team") {
                    if (isset($state['show_finals']) && 'true' == $state['show_finals'] && isset($state['show_rounds']) && 'true' == $state['show_rounds']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (SELECT game_id FROM league_games WHERE event_id=' . $state['leagueID'] . ')';
                        $conditions[] = $subQuery;
                    } elseif (isset($state['show_finals']) && 'true' == $state['show_finals']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (SELECT game_id FROM league_games WHERE is_finals = 1 AND event_id=' . $state['leagueID'] . ')';
                        $conditions[] = $subQuery;
                    } elseif (isset($state['show_rounds']) && 'true' == $state['show_rounds']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id=' . $state['leagueID'] . ')';
                        $conditions[] = $subQuery;
                    } else {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (0)';
                        $conditions[] = $subQuery;
                    }
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        if (isset($state['startDate'])) {
            if (isset($state['endDate'])) {
                $conditions[] = ["Scorecard.game_datetime BETWEEN ('{$state['startDate']}'::timestamptz AT TIME ZONE 'UTC') AND ('{$state['endDate']}::timestamptz AT TIME ZONE 'UTC')"];
            } else {
                $conditions[] = ["Scorecard.game_datetime >= '{$state['startDate']}'::timestamptz AT TIME ZONE 'UTC'"];
            }
        } elseif (isset($state['endDate'])) {
            $conditions[] = ["Scorecard.game_datetime <= '{$state['endDate']}::timestamptz AT TIME ZONE 'UTC'"];
        }

        return $this->find('all', [
            'fields' => [
                'Scorecard.player_id',
                'MIN(Scorecard.score) as min_score',
                'ROUND(AVG(Scorecard.score)) as avg_score',
                'MAX(Scorecard.score) as max_score',
                'SUM(Scorecard.score) as total_score',
                'AVG(Scorecard.mvp_points) as avg_mvp',
                'SUM(Scorecard.mvp_points) as total_mvp',
                'COUNT(Scorecard.game_datetime) as games_played',
                'MIN(Scorecard.accuracy) as min_acc',
                'AVG(Scorecard.accuracy) as avg_acc',
                'MAX(Scorecard.accuracy) as max_acc',
                '(SUM(Scorecard.nukes_detonated)/GREATEST(SUM(Scorecard.nukes_activated),1)) as nuke_ratio',
                '(SUM(Scorecard.shot_opponent)/GREATEST(SUM(Scorecard.times_zapped),1.0)) as hit_diff',
                'AVG(Scorecard.missiled_opponent) as avg_missiles',
                'AVG(Scorecard.medic_hits) as avg_medic_hits',
                'AVG(Scorecard.shot_3hit) as avg_3hit',
                'AVG(Scorecard.scout_rapid) as avg_rapid_fire',
                'AVG(Scorecard.ammo_boost) as avg_ammo_boost',
                'AVG(Scorecard.life_boost) as avg_life_boost',
                'AVG(Scorecard.resupplies) as avg_resup',
                'AVG(Scorecard.lives_left) as avg_lives',
                '(SUM(Scorecard.team_elim)::DOUBLE PRECISION/COUNT(Scorecard.id)::DOUBLE PRECISION) as elim_rate',
                'SUM(GameResult.won) as games_won',
            ],
            'contain' => [
                'Player' => [
                    'fields' => ['id', 'player_name'],
                ],
            ],
            'joins' => [
                [
                    'table' => 'game_results',
                    'alias' => 'GameResult',
                    'type' => 'LEFT',
                    'conditions' => [
                        'GameResult.scorecard_id = Scorecard.id',
                    ],
                ],
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Player.id' . (($min_games > 0) ? " HAVING COUNT(Scorecard.game_datetime) >= {$min_games}" : ''),
            'order' => 'avg_mvp DESC',
        ]);
    }

    public function getAllAvgMVP($state = null)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if (isset($state['scoring']) && $state['scoring'] == "team") {
                    if (isset($state['show_finals']) && 'true' == $state['show_finals'] && isset($state['show_rounds']) && 'true' == $state['show_rounds']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (SELECT game_id FROM league_games WHERE event_id=' . $state['leagueID'] . ')';
                        $conditions[] = $subQuery;
                    } elseif (isset($state['show_finals']) && 'true' == $state['show_finals']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (SELECT game_id FROM league_games WHERE is_finals = 1 AND event_id=' . $state['leagueID'] . ')';
                        $conditions[] = $subQuery;
                    } elseif (isset($state['show_rounds']) && 'true' == $state['show_rounds']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id=' . $state['leagueID'] . ')';
                        $conditions[] = $subQuery;
                    } else {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = '"Scorecard".game_id IN (0)';
                        $conditions[] = $subQuery;
                    }
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        if (isset($state['startDate'])) {
            if (isset($state['endDate'])) {
                $conditions[] = ["Scorecard.game_datetime BETWEEN '{$state['startDate']}' AND '{$state['endDate']}'"];
            } else {
                $conditions[] = ["Scorecard.game_datetime >= '{$state['startDate']}'"];
            }
        } elseif (isset($state['endDate'])) {
            $conditions[] = ["Scorecard.game_datetime <= '{$state['endDate']}'"];
        }

        $players_position = $this->find('all', [
            'fields' => [
                'Scorecard.player_id',
                'Scorecard.position',
                'AVG(Scorecard.mvp_points) as avg_mvp',
                'AVG(Scorecard.accuracy) as avg_acc',
                'COUNT(Scorecard.game_datetime) as games_played',
                'SUM(GameResult.won) as games_won',
                'SUM(Scorecard.mvp_points)/SUM(Scorecard.survived) as mvp_per_second',
            ],
            'joins' => [
                [
                    'table' => 'game_results',
                    'alias' => 'GameResult',
                    'type' => 'LEFT',
                    'conditions' => [
                        'GameResult.scorecard_id = Scorecard.id',
                    ],
                ],
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Scorecard.position',
        ]);

        $players_overall = $this->find('all', [
            'fields' => [
                'Scorecard.player_id',
                'AVG(Scorecard.mvp_points) as avg_mvp',
                'SUM(Scorecard.mvp_points) as total_mvp',
                'AVG(Scorecard.accuracy) as avg_acc',
                '(SUM(Scorecard.shot_opponent)/GREATEST(SUM(Scorecard.times_zapped),1.0)) as hit_diff',
                'COUNT(Scorecard.game_datetime) as games_played',
                'SUM(GameResult.won) as games_won',
                'SUM(Scorecard.mvp_points)/SUM(Scorecard.survived) as mvp_per_second',
            ],
            'joins' => [
                [
                    'table' => 'game_results',
                    'alias' => 'GameResult',
                    'type' => 'LEFT',
                    'conditions' => [
                        'GameResult.scorecard_id = Scorecard.id',
                    ],
                ],
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id',
        ]);
        $players = $this->Player->find('list');

        $results = [];
        foreach ($players_overall as $player) {
            if (!isset($results[$player['Scorecard']['player_id']])) {
                $results[$player['Scorecard']['player_id']] = [];
                $results[$player['Scorecard']['player_id']]['player_name'] = $players[$player['Scorecard']['player_id']];
            }

            $results[$player['Scorecard']['player_id']]['avg_avg_mvp'] = $player[0]['avg_mvp'];
            $results[$player['Scorecard']['player_id']]['total_mvp'] = $player[0]['total_mvp'];
            $results[$player['Scorecard']['player_id']]['avg_avg_acc'] = $player[0]['avg_acc'];
            $results[$player['Scorecard']['player_id']]['hit_diff'] = $player[0]['hit_diff'];
            $results[$player['Scorecard']['player_id']]['total_games_won'] = $player[0]['games_won'];
            $results[$player['Scorecard']['player_id']]['total_games'] = $player[0]['games_played'];
            $results[$player['Scorecard']['player_id']]['mvp_per_second'] = $player[0]['mvp_per_second'];
            $results[$player['Scorecard']['player_id']]['Commander']['avg_mvp'] = 0;
            $results[$player['Scorecard']['player_id']]['Commander']['avg_acc'] = 0;
            $results[$player['Scorecard']['player_id']]['Commander']['games_won'] = 0;
            $results[$player['Scorecard']['player_id']]['Commander']['games_played'] = 0;
            $results[$player['Scorecard']['player_id']]['Heavy Weapons']['avg_mvp'] = 0;
            $results[$player['Scorecard']['player_id']]['Heavy Weapons']['avg_acc'] = 0;
            $results[$player['Scorecard']['player_id']]['Heavy Weapons']['games_won'] = 0;
            $results[$player['Scorecard']['player_id']]['Heavy Weapons']['games_played'] = 0;
            $results[$player['Scorecard']['player_id']]['Scout']['avg_mvp'] = 0;
            $results[$player['Scorecard']['player_id']]['Scout']['avg_acc'] = 0;
            $results[$player['Scorecard']['player_id']]['Scout']['games_won'] = 0;
            $results[$player['Scorecard']['player_id']]['Scout']['games_played'] = 0;
            $results[$player['Scorecard']['player_id']]['Ammo Carrier']['avg_mvp'] = 0;
            $results[$player['Scorecard']['player_id']]['Ammo Carrier']['avg_acc'] = 0;
            $results[$player['Scorecard']['player_id']]['Ammo Carrier']['games_won'] = 0;
            $results[$player['Scorecard']['player_id']]['Ammo Carrier']['games_played'] = 0;
            $results[$player['Scorecard']['player_id']]['Medic']['avg_mvp'] = 0;
            $results[$player['Scorecard']['player_id']]['Medic']['avg_acc'] = 0;
            $results[$player['Scorecard']['player_id']]['Medic']['games_won'] = 0;
            $results[$player['Scorecard']['player_id']]['Medic']['games_played'] = 0;
        }

        foreach ($players_position as $player) {
            $results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['avg_mvp'] = $player[0]['avg_mvp'];
            $results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['avg_acc'] = $player[0]['avg_acc'];
            $results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['games_won'] = $player[0]['games_won'];
            $results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['games_played'] = $player[0]['games_played'];
            $results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['mvp_per_second'] = $player[0]['mvp_per_second'];
        }

        return $results;
    }

    public function getMedicHitStats($state = null)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if ($state['scoring'] == "team") {
                    if (isset($state['show_finals']) && 'true' == $state['show_finals'] && isset($state['show_rounds']) && 'true' == $state['show_rounds']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE event_id='{$state['leagueID']}')";
                        $conditions[] = $subQuery;
                    } elseif (isset($state['show_finals']) && 'true' == $state['show_finals']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 1 AND event_id='{$state['leagueID']}')";
                        $conditions[] = $subQuery;
                    } elseif (isset($state['show_rounds']) && 'true' == $state['show_rounds']) {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
                        $conditions[] = $subQuery;
                    } else {
                        $subQuery = new stdClass();
                        $subQuery->type = 'expression';
                        $subQuery->value = 'game_id IN (0)';
                        $conditions[] = $subQuery;
                    }
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        if (isset($state['startDate'])) {
            if (isset($state['endDate'])) {
                $conditions[] = ["Scorecard.game_datetime BETWEEN '{$state['startDate']}' AND '{$state['endDate']}'"];
            } else {
                $conditions[] = ["Scorecard.game_datetime >= '{$state['startDate']}'"];
            }
        } elseif (isset($state['endDate'])) {
            $conditions[] = ["Scorecard.game_datetime <= '{$state['endDate']}'"];
        }

        $subQueryConditions = $conditions;

        $subQueryConditions[] = ['position NOT IN (\'Medic\', \'Ammo Carrier\')'];

        $fields = [
            'player_id',
            'SUM(Scorecard.medic_hits) AS total_medic_hits',
            '(SUM(Scorecard.medic_hits)::DECIMAL/COUNT(Scorecard.game_datetime)::DECIMAL) AS medic_hits_per_game',
            'COUNT(Scorecard.game_datetime) AS games_played',
        ];

        $non_resup_scores = $this->find('all', [
            'fields' => $fields,
            'conditions' => $subQueryConditions,
            'group' => 'Scorecard.player_id HAVING (SUM(Scorecard.medic_hits)::DECIMAL/COUNT(Scorecard.game_datetime)::DECIMAL) > 0',
            'order' => 'Scorecard.player_id DESC',
        ]);

        $scores = $this->find('all', [
            'fields' => $fields,
            'contain' => [
                'Player' => [
                    'fields' => [
                        'id',
                        'player_name',
                    ],
                ],
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Player.id HAVING (SUM(Scorecard.medic_hits)::DECIMAL/COUNT(Scorecard.game_datetime)::DECIMAL) > 0',
            'order' => 'Scorecard.player_id DESC',
        ]);

        foreach ($scores as &$score) {
            foreach ($non_resup_scores as $non_resup_score) {
                $score[0]['non_resup_total_medic_hits'] = 0;
                $score[0]['non_resup_medic_hits_per_game'] = 0;
                $score[0]['non_resup_games_played'] = 0;
                if ($score['Scorecard']['player_id'] == $non_resup_score['Scorecard']['player_id']) {
                    $score[0]['non_resup_total_medic_hits'] = $non_resup_score[0]['total_medic_hits'];
                    $score[0]['non_resup_medic_hits_per_game'] = $non_resup_score[0]['medic_hits_per_game'];
                    $score[0]['non_resup_games_played'] = $non_resup_score[0]['games_played'];

                    break;
                }
            }
        }

        return $scores;
    }

    public function getMedicHitStatsByDate($date, $state)
    {
        $conditions = [];

        if (!is_null($date)) {
            $conditions[] = ["Scorecard.game_datetime BETWEEN ('{$date}'::timestamptz AT TIME ZONE 'UTC') AND ('{$date}'::timestamptz AT TIME ZONE 'UTC') + INTERVAL '1 day'"];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        $scores = $this->find('all', [
            'fields' => [
                'player_name',
                'player_id',
                'position',
                'SUM(Scorecard.medic_hits) as total_medic_hits',
                'COUNT(Scorecard.game_datetime) as games_played',
            ],
            'conditions' => $conditions,
            'group' => 'player_id, player_name, position',
        ]);

        $results = [];

        foreach ($scores as $score) {
            $pid = $score['Scorecard']['player_id'];
            if (!isset($results[$pid])) {
                $results[$pid] = [
                    'player_id' => $score['Scorecard']['player_id'],
                    'player_name' => $score['Scorecard']['player_name'],
                    'total_medic_hits' => 0,
                    'medic_hits_per_game' => 0,
                    'games_played' => 0,
                    'non_resup_total_medic_hits' => 0,
                    'non_resup_medic_hits_per_game' => 0,
                    'non_resup_games_played' => 0,
                ];
            }

            $results[$pid]['total_medic_hits'] += $score[0]['total_medic_hits'];
            $results[$pid]['games_played'] += $score[0]['games_played'];

            if ('Commander' == $score['Scorecard']['position'] || 'Heavy Weapons' == $score['Scorecard']['position'] || 'Scout' == $score['Scorecard']['position']) {
                $results[$pid]['non_resup_total_medic_hits'] += $score[0]['total_medic_hits'];
                $results[$pid]['non_resup_games_played'] += $score[0]['games_played'];
            }
        }

        foreach ($results as &$result) {
            $result['medic_hits_per_game'] = $result['total_medic_hits'] / $result['games_played'];

            if ($result['non_resup_games_played'] > 0) {
                $result['non_resup_medic_hits_per_game'] = $result['non_resup_total_medic_hits'] / $result['non_resup_games_played'];
            }
        }

        return array_values($results);
    }

    public function getMedicHitStatsByRound($round, $league_id)
    {
        //need to do round shit here
        $conditions = [];

        $conditions[] = ['Scorecard.event_id' => $league_id];

        return $this->find('all', [
            'fields' => [
                'player_name',
                'player_id',
                'SUM(Scorecard.medic_hits) as total_medic_hits',
                '(SUM(Scorecard.medic_hits)/COUNT(Scorecard.game_datetime)) as medic_hits_per_game',
            ],
            'conditions' => $conditions,
            'group' => 'player_name',
            'order' => 'total_medic_hits DESC',
        ]);
    }

    public function getPlayerGamesScorecardsById($player_id, $state = null)
    {
        $conditions = [];

        $conditions['player_id'] = $player_id;

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions += ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions += ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions += ['Scorecard.event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'fields' => [
                'Scorecard.*',
                'Game.*',
                'Match.id',
                'Match.match',
                'Round.id',
                'Round.is_finals',
                'Round.round',
                'Red_Team.name',
                'Green_Team.name',
            ],
            'conditions' => $conditions,
            'order' => 'Scorecard.game_datetime DESC',
            'joins' => [
                [
                    'table' => 'games',
                    'alias' => 'Game',
                    'type' => 'LEFT',
                    'conditions' => ['Game.id = Scorecard.game_id'],
                ],
                [
                    'table' => 'matches',
                    'alias' => 'Match',
                    'type' => 'LEFT',
                    'conditions' => ['Match.id = Game.match_id'],
                ],
                [
                    'table' => 'rounds',
                    'alias' => 'Round',
                    'type' => 'LEFT',
                    'conditions' => ['Round.id = Match.round_id'],
                ],
                [
                    'table' => 'event_teams',
                    'alias' => 'Red_Team',
                    'type' => 'LEFT',
                    'conditions' => ['Red_Team.id = Game.red_team_id'],
                ],
                [
                    'table' => 'event_teams',
                    'alias' => 'Green_Team',
                    'type' => 'LEFT',
                    'conditions' => ['Green_Team.id = Game.green_team_id'],
                ],
            ],
        ]);
    }

    public function getPlayerTopScorecardsMVPById($player_id, $position = '')
    {
        $conditions = ['player_id' => $player_id];
        if ('' != $position) {
            $conditions['position'] = $position;
        }

        return $this->find('all', [
            'conditions' => $conditions,
            'order' => 'Scorecard.mvp_points DESC',
            'limit' => 5,
            'contain' => [
                'Game' => [],
            ],
        ]);
    }

    public function getPlayerTopScorecardsScoreById($player_id, $position = '')
    {
        $conditions = ['player_id' => $player_id];
        if ('' != $position) {
            $conditions['position'] = $position;
        }

        return $this->find('all', [
            'conditions' => $conditions,
            'order' => 'Scorecard.score DESC',
            'limit' => 5,
            'contain' => [
                'Game' => [],
            ],
        ]);
    }

    public function getOverallAverages($state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'fields' => [
                'position',
                'AVG(score) as avg_score',
                'AVG(mvp_points) as avg_mvp',
            ],
            'conditions' => $conditions,
            'group' => [
                'position',
            ],
        ]);
    }

    public function getHitDetails($player_id, $game_id)
    {
        $scorecards = $this->find('all', [
            'fields' => [
                'id',
                'player_name',
                'team',
                'position',
                'score',
                'player_id',
                'game_id',
            ],
            'contain' => [
                'Hit' => [
                    'conditions' => [
                        'OR' => [
                            'player_id' => $player_id,
                            'target_id' => $player_id,
                        ],
                    ],
                    'Player',
                    'Target',
                ],
            ],
            'conditions' => [
                'game_id' => $game_id,
            ],
        ]);

        $results = [];

        //init the results array for each other player and set hits to 0
        foreach ($scorecards as $scorecard) {
            $results[$scorecard['Scorecard']['player_id']] = $scorecard['Scorecard'];
            $results[$scorecard['Scorecard']['player_id']]['hit'] = 0;
            $results[$scorecard['Scorecard']['player_id']]['hitBy'] = 0;
            $results[$scorecard['Scorecard']['player_id']]['missile'] = 0;
            $results[$scorecard['Scorecard']['player_id']]['missileBy'] = 0;
        }

        foreach ($scorecards as $scorecard) {
            foreach ($scorecard['Hit'] as $record) {
                if ($record['Player']['id'] == $player_id) {
                    $results[$record['Target']['id']]['hit'] = $record['hits'];
                    $results[$record['Target']['id']]['missile'] = $record['missiles'];
                } else {
                    $results[$record['Player']['id']]['hitBy'] = $record['hits'];
                    $results[$record['Player']['id']]['missileBy'] = $record['missiles'];
                }
            }
        }

        foreach ($results as $key => $row) {
            $team[$key] = $row['team'];
            $score[$key] = $row['score'];
        }
        array_multisort($team, SORT_ASC, $score, SORT_DESC, $results);

        return $results;
    }

    // $teamFlag is 'all', 'team', or 'opponent'
    public function getPlayerHitDetails($player_id, $positions, $teamFlag, $state)
    {
        $conditions = [];

        $conditions[] = ['Scorecard.player_id' => $player_id];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        $playerPos = "'" . implode('\',\'', $positions['player']) . "'";
        $targetPos = "'" . implode('\',\'', $positions['target']) . "'";
        $conditions[] = ['"Scorecard".position IN (' . $playerPos . ')'];

        $scorecards = $this->find('list', [
            'fields' => ['game_id'],
            'conditions' => $conditions,
        ]);

        if (count($scorecards) > 0) {
            $games_ids = implode(',', $scorecards);
        } else {
            $games_ids = 0;
        }

        $whereFlag = '';
        if ('team' == $teamFlag) {
            $whereFlag = ' AND scorecards.team = targets.team';
        } elseif ('opponent' == $teamFlag) {
            $whereFlag = ' AND scorecards.team != targets.team';
        }

        $playerHitsQuery = '
			SELECT 
				hits.player_id,
				hits.target_id,
				SUM(hits.hits) AS hits,
				SUM(hits.missiles) AS missiles,
				COUNT(hits.scorecard_id) AS games_played
			FROM
				hits
					LEFT JOIN
				scorecards ON hits.scorecard_id = scorecards.id
					LEFT JOIN
				scorecards AS targets ON targets.game_id = scorecards.game_id
					AND targets.player_id = hits.target_id
			WHERE
				hits.player_id = ' . $player_id . '
					AND scorecards.position IN (' . $playerPos . ')
					AND targets.position IN (' . $targetPos . ')
					' . $whereFlag . '
					AND scorecards.game_id IN (' . $games_ids . ')
			GROUP BY hits.target_id, hits.player_id
		';

        $playerHitByQuery =
            '
			SELECT 
				hits.player_id,
				hits.target_id,
				SUM(hits.hits) AS hits,
				SUM(hits.missiles) AS missiles,
				COUNT(hits.scorecard_id) AS games_played
			FROM
				hits
					LEFT JOIN
				scorecards ON hits.scorecard_id = scorecards.id
					LEFT JOIN
				scorecards AS targets ON targets.game_id = scorecards.game_id
					AND targets.player_id = hits.target_id
			WHERE
				hits.target_id = ' . $player_id . '
					AND scorecards.position IN (' . $targetPos . ')
					AND targets.position IN (' . $playerPos . ')
					' . $whereFlag . '
					AND scorecards.game_id IN (' . $games_ids . ')
			GROUP BY hits.player_id, hits.target_id
		';

        $db = $this->getDataSource();

        $playerHits = $db->fetchAll($playerHitsQuery);
        $playerHitBy = $db->fetchAll($playerHitByQuery);

        $hits = [];

        foreach ($playerHitBy as $hit) {
            $hits[$hit[0]['player_id']] = [
                'opponent_id' => $hit[0]['player_id'],
                'hit_by' => $hit[0]['hits'],
                'missile_by' => $hit[0]['missiles'],
                'games_played' => $hit[0]['games_played'],
                'hits' => 0,
                'missiles' => 0,
            ];
        }

        foreach ($playerHits as $hit) {
            if (isset($hits[$hit[0]['target_id']])) {
                $hits[$hit[0]['target_id']]['hits'] = $hit[0]['hits'];
                $hits[$hit[0]['target_id']]['missiles'] = $hit[0]['missiles'];
            }
        }

        return array_values($hits);
    }

    public function getPlayerTargetsBreakdown($player_id, $state)
    {
        $conditions = [];

        $conditions[] = ['Scorecard.player_id' => $player_id];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        $overall = $this->find('all', [
            'fields' => [
                'player_id',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $conditions,
            'group' => 'player_id',
        ]);

        $overallPositions = $this->find('all', [
            'fields' => [
                'player_id',
                'position',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $conditions,
            'group' => 'player_id, position',
        ]);

        $survivesConditions = $conditions;
        $survivesConditions[] = ['Scorecard.lives_left > 0'];

        $survives = $this->find('all', [
            'fields' => [
                'player_id',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $survivesConditions,
            'group' => 'player_id',
        ]);

        $survivesPositions = $this->find('all', [
            'fields' => [
                'player_id',
                'position',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $survivesConditions,
            'group' => 'player_id, position',
        ]);

        $survivesElimConditions = $conditions;
        $survivesElimConditions[] = ['Scorecard.lives_left > 0'];
        $survivesElimConditions[] = ['Scorecard.elim_other_team = 1'];

        $survivesElim = $this->find('all', [
            'fields' => [
                'player_id',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $survivesElimConditions,
            'group' => 'player_id',
        ]);

        $survivesElimPositions = $this->find('all', [
            'fields' => [
                'player_id',
                'position',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $survivesElimConditions,
            'group' => 'player_id, position',
        ]);

        $dieElimConditions = $conditions;
        $dieElimConditions[] = ['Scorecard.lives_left = 0'];
        $dieElimConditions[] = ['Scorecard.elim_other_team = 1'];

        $dieElim = $this->find('all', [
            'fields' => [
                'player_id',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $dieElimConditions,
            'group' => 'player_id',
        ]);

        $dieElimPositions = $this->find('all', [
            'fields' => [
                'player_id',
                'position',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $dieElimConditions,
            'group' => 'player_id, position',
        ]);

        $elimConditions = $conditions;
        $elimConditions[] = ['Scorecard.team_elim = 1'];

        $elim = $this->find('all', [
            'fields' => [
                'player_id',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $elimConditions,
            'group' => 'player_id',
        ]);

        $elimPositions = $this->find('all', [
            'fields' => [
                'player_id',
                'position',
                '(AVG(bases_destroyed)/2) as avg_targets',
            ],
            'conditions' => $elimConditions,
            'group' => 'player_id, position',
        ]);

        $response = [];

        $base = [
            'overall' => 'n/a',
            'survives' => 'n/a',
            'survivesElim' => 'n/a',
            'dieElim' => 'n/a',
            'elim' => 'n/a',
        ];

        $response['all'] = $response['commander'] = $response['heavy'] = $response['scout'] = $response['ammo'] = $response['medic'] = $base;

        $response['commander']['position'] = 'Commander';
        $response['heavy']['position'] = 'Heavy Weapons';
        $response['scout']['position'] = 'Scout';
        $response['ammo']['position'] = 'Ammo Carrier';
        $response['medic']['position'] = 'Medic';

        $categories = [
            'overall' => $overallPositions,
            'survives' => $survivesPositions,
            'survivesElim' => $survivesElimPositions,
            'dieElim' => $dieElimPositions,
            'elim' => $elimPositions,
        ];

        $response['all']['position'] = 'All Positions';
        $response['all']['overall'] = isset($overall[0][0]['avg_targets']) ? $overall[0][0]['avg_targets'] : 'n/a';
        $response['all']['survives'] = isset($survives[0][0]['avg_targets']) ? $survives[0][0]['avg_targets'] : 'n/a';
        $response['all']['survivesElim'] = isset($survivesElim[0][0]['avg_targets']) ? $survivesElim[0][0]['avg_targets'] : 'n/a';
        $response['all']['dieElim'] = isset($dieElim[0][0]['avg_targets']) ? $dieElim[0][0]['avg_targets'] : 'n/a';
        $response['all']['elim'] = isset($elim[0][0]['avg_targets']) ? $elim[0][0]['avg_targets'] : 'n/a';

        foreach ($categories as $key => $value) {
            foreach ($value as $entry) {
                if ('Commander' == $entry['Scorecard']['position']) {
                    $response['commander'][$key] = $entry[0]['avg_targets'];
                }

                if ('Heavy Weapons' == $entry['Scorecard']['position']) {
                    $response['heavy'][$key] = $entry[0]['avg_targets'];
                }

                if ('Scout' == $entry['Scorecard']['position']) {
                    $response['scout'][$key] = $entry[0]['avg_targets'];
                }

                if ('Ammo Carrier' == $entry['Scorecard']['position']) {
                    $response['ammo'][$key] = $entry[0]['avg_targets'];
                }

                if ('Medic' == $entry['Scorecard']['position']) {
                    $response['medic'][$key] = $entry[0]['avg_targets'];
                }
            }
        }

        return array_values($response);
    }

    public function getLeaderboards($state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if (!isset($state['show_finals']) || 'true' != $state['show_finals']) {
                    $subQuery = new stdClass();
                    $subQuery->type = 'expression';
                    $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
                    $conditions[] = $subQuery;
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'contain' => [
                'Player' => [
                    'fields' => [
                        'id',
                        'player_name',
                    ],
                ],
            ],
            'fields' => [
                'Scorecard.player_id',
                'COUNT(game_datetime) as games_played',
                'SUM(times_missiled) as times_missiled_total',
                'SUM(nukes_detonated) as nukes_detonated_total',
                'SUM(nukes_canceled) as nukes_canceled_total',
                'SUM(medic_hits) as medic_hits_total',
                'SUM(own_medic_hits) as own_medic_hits_total',
                'SUM(score) as score_total',
                'SUM(elim_other_team) as elim_other_team_total',
                'SUM(team_elim) as team_elim_total',
                'SUM(own_nuke_cancels) as own_nuke_cancels_total',
                'SUM(missiled_opponent) as missiled_opponent_total',
                'SUM(missiled_team) as missiled_team_total',
                'SUM(shots_fired) as shots_fired_total',
                'SUM(uptime+resupply_downtime+other_downtime) as time_played_total'
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Player.id',
        ]);
    }

    public function getMedicOnMedicHits($state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if (!isset($state['show_finals']) || 'true' != $state['show_finals']) {
                    $subQuery = new stdClass();
                    $subQuery->type = 'expression';
                    $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
                    $conditions[] = $subQuery;
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        $conditions[] = ['position' => 'Medic'];

        return $this->find('all', [
            'contain' => [
                'Player' => [
                    'fields' => [
                        'id',
                        'player_name',
                    ],
                ],
            ],
            'fields' => [
                'Scorecard.player_id',
                'SUM(medic_hits) as medic_hits_total',
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Player.id',
        ]);
    }

    public function getMissileLeaderBoards($state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if (!isset($state['show_finals']) || 'true' != $state['show_finals']) {
                    $subQuery = new stdClass();
                    $subQuery->type = 'expression';
                    $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
                    $conditions[] = $subQuery;
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        $conditions[] = ['position IN (\'Heavy Weapons\', \'Commander\')'];

        return $this->find('all', [
            'contain' => [
                'Player' => [
                    'fields' => [
                        'id',
                        'player_name',
                    ],
                ],
            ],
            'fields' => [
                'Scorecard.player_id',
                'COUNT(game_datetime) as games_played',
                'SUM(missiled_opponent) as missiled_opponent_total',
                'SUM(missiled_team) as missiled_team_total',
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Player.id',
        ]);
    }

    public function getPositionLeaderboards($position, $state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if (!isset($state['show_finals']) || 'true' != $state['show_finals']) {
                    $subQuery = new stdClass();
                    $subQuery->type = 'expression';
                    $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
                    $conditions[] = $subQuery;
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        $conditions[] = ['position' => $position];

        $leaderboards = $this->find('all', [
            'contain' => [
                'Player' => [
                    'fields' => [
                        'player_name',
                    ],
                ],
                'Penalty',
            ],
            'fields' => [
                'player_id',
                'score',
                'mvp_points',
                'game_id',
            ],
            'conditions' => $conditions,
            'order' => 'score DESC',
            'limit' => 500,
        ]);

        foreach ($leaderboards as &$entry) {
            $adjScore = 0;
            foreach ($entry['Penalty'] as $penalty) {
                $adjScore += $penalty['value'];
            }
            $entry['Scorecard']['final_score'] = $entry['Scorecard']['score'] + $adjScore;
        }

        return $leaderboards;
    }

    public function getPenaltyCount($state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];

            if ('league' == $state['gametype']) {
                if (isset($state['show_subs']) && 'false' == $state['show_subs']) {
                    $conditions[] = ['Scorecard.is_sub = false'];
                }

                if (!isset($state['show_finals']) || 'true' != $state['show_finals']) {
                    $subQuery = new stdClass();
                    $subQuery->type = 'expression';
                    $subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
                    $conditions[] = $subQuery;
                }
            }
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'contain' => [
                'Player' => [
                    'fields' => [
                        'id',
                        'player_name',
                    ],
                ],
            ],
            'joins' => [
                [
                    'table' => 'penalties',
                    'alias' => 'Penalty',
                    'type' => 'LEFT',
                    'conditions' => [
                        'Penalty.scorecard_id = Scorecard.id',
                        'Penalty.type != \'Penalty Removed\'',
                    ],
                ],
            ],
            'fields' => [
                'Scorecard.player_id',
                'COUNT(Penalty.id) as penalties',
            ],
            'conditions' => $conditions,
            'group' => 'Scorecard.player_id, Player.id',
        ]);
    }

    public function getCurrentStreaks($state)
    {
        $where = '1';

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $where .= " AND center_id = {$state['centerID']}";
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $where .= " AND type = '{$state['gametype']}'";
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $where .= " AND event_id = {$state['leagueID']}";
        }

        return $this->query("SELECT 
									streakset.player_id,
									players.player_name,
									streakset.gameresult,
									MAX(streakset.winlossstreak) AS maxstreak
								FROM
									(SELECT 
										gr.game_datetime,
										gr.player_id,
										gr.result,
										@curstatus:=gr.result AS gameresult,
										@curplayer:=gr.player_id AS curplayer,
										@winlossseq:=IF(@curplayer = @lastplayer, IF(@curstatus = @laststatus, @winlossseq + 1, 1), 1) AS winlossstreak,
										@laststatus:=@curstatus AS carryOverForNextRecord,
										@lastplayer:=@curplayer AS moreCarryOver
									FROM
										(SELECT 
											*
										FROM
											game_results
										WHERE {$where}
										ORDER BY player_id , game_datetime) AS gr, 
										(SELECT 
											@CurStatus:='',
											@curplayer:=0,
											@LastStatus:='',
											@lastplayer:=0,
											@WinLossSeq:=0
										) sqlvars) streakset
										LEFT JOIN
											players ON (streakset.player_id = players.id)
								WHERE
									game_datetime = (select max(game_datetime) from game_results where player_id=streakset.player_id)
								GROUP BY streakset.player_id , streakset.gameresult
								ORDER BY maxstreak DESC
		");
    }

    public function getStreaks($type, $state)
    {
        $subWhere = '1=1';

        $where = '1=1';

        if ('current' == $type) {
            $where .= ' AND game_datetime = (SELECT max (game_datetime)
            FROM game_results
           WHERE player_id = streakset.player_id)';
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $subWhere .= " AND center_id = {$state['centerID']}";
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $subWhere .= " AND type = '{$state['gametype']}'";
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $subWhere .= " AND event_id = {$state['leagueID']}";
        }

        return $this->query("SELECT streakset.player_id,
                                        players.id,
                                        streakset.result,
                                        players.player_name,
                                        max (streakset.streak)
                                FROM (SELECT g.*,
                                                row_number ()
                                                OVER (PARTITION BY seqnum - seqnum_r, result
                                                    ORDER BY game_datetime) AS streak
                                        FROM (SELECT g.*,
                                                        row_number () OVER (ORDER BY player_id, game_datetime)
                                                        AS seqnum,
                                                        row_number ()
                                                        OVER (PARTITION BY player_id, result
                                                            ORDER BY player_id, game_datetime)
                                                        AS seqnum_r
                                                FROM game_results g
                                                WHERE {$subWhere}) g) AS streakset
                                        LEFT JOIN players ON players.id = streakset.player_id
                                WHERE {$where}
                                GROUP BY streakset.player_id, players.id, streakset.result
                                ORDER BY max (streakset.streak) DESC");
    }

    public function getEventScorecards($event_id)
    {
        $conditions[] = ['Scorecard.event_id' => $event_id];

        return $this->find('all', [
            'conditions' => $conditions,
            'contain' => [
                'Game' => [],
            ],
        ]);
    }

    public function getTopTeams($min_games, $min_days, $state)
    {
        $matrix = $this->_loadMatrix($min_games, $min_days, $state);

        //reverse the matrix to make it a cost matrix
        $max = 0;
        foreach ($matrix as $row) {
            foreach ($row as $column) {
                if ($column > $max) {
                    $max = $column;
                }
            }
        }

        foreach ($matrix as &$row) {
            foreach ($row as &$column) {
                $column = $max - $column;
            }
        }

        //run the algorithm
        $M = $this->_munkres($matrix);

        //build the results
        $team_a = [];
        $r = 0;
        foreach ($matrix as $key => $value) {
            for ($c = 0; $c < count($M[$r]); ++$c) {
                if (1 == $M[$r][$c]) {
                    switch ($c) {
                        case 0:
                            $team_a['Ammo Carrier'] = ['position' => 'Ammo Carrier', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Ammo Carrier'])];

                            break;
                        case 1:
                            $team_a['Commander'] = ['position' => 'Commander', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Commander'])];

                            break;
                        case 2:
                            $team_a['Heavy Weapons'] = ['position' => 'Heavy Weapons', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Heavy Weapons'])];

                            break;
                        case 3:
                            $team_a['Medic'] = ['position' => 'Medic', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Medic'])];

                            break;
                        case 4:
                            $team_a['Scout'] = ['position' => 'Scout', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout'])];

                            break;
                        case 5:
                            $team_a['Scout2'] = ['position' => 'Scout2', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout'])];

                            break;
                    }

                    break;
                }
            }
            ++$r;
        }

        foreach ($team_a as $player) {
            unset($matrix[$player['player_id']]);
        }

        $M = $this->_munkres($matrix);
        $team_b = [];
        $r = 0;
        foreach ($matrix as $key => $value) {
            for ($c = 0; $c < count($M[$r]); ++$c) {
                if (1 == $M[$r][$c]) {
                    switch ($c) {
                        case 0:
                            $team_b['Ammo Carrier'] = ['position' => 'Ammo Carrier', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Ammo Carrier'])];

                            break;
                        case 1:
                            $team_b['Commander'] = ['position' => 'Commander', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Commander'])];

                            break;
                        case 2:
                            $team_b['Heavy Weapons'] = ['position' => 'Heavy Weapons', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Heavy Weapons'])];

                            break;
                        case 3:
                            $team_b['Medic'] = ['position' => 'Medic', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Medic'])];

                            break;
                        case 4:
                            $team_b['Scout'] = ['position' => 'Scout', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout'])];

                            break;
                        case 5:
                            $team_b['Scout2'] = ['position' => 'Scout2', 'player_id' => $key, 'player_name' => $this->Player->findById($key, ['player_name'])['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout'])];

                            break;
                    }

                    break;
                }
            }
            ++$r;
        }

        if (!isset($team_a['Ammo Carrier'])) {
            $team_a['Ammo Carrier'] = ['position' => 'Ammo Carrier', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_a['Commander'])) {
            $team_a['Commander'] = ['position' => 'Commander', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_a['Heavy Weapons'])) {
            $team_a['Heavy Weapons'] = ['position' => 'Heavy Weapons', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_a['Medic'])) {
            $team_a['Medic'] = ['position' => 'Medic', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_a['Scout'])) {
            $team_a['Scout'] = ['position' => 'Scout', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_a['Scout2'])) {
            $team_a['Scout2'] = ['position' => 'Scout2', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }

        if (!isset($team_b['Ammo Carrier'])) {
            $team_b['Ammo Carrier'] = ['position' => 'Ammo Carrier', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_b['Commander'])) {
            $team_b['Commander'] = ['position' => 'Commander', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_b['Heavy Weapons'])) {
            $team_b['Heavy Weapons'] = ['position' => 'Heavy Weapons', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_b['Medic'])) {
            $team_b['Medic'] = ['position' => 'Medic', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_b['Scout'])) {
            $team_b['Scout'] = ['position' => 'Scout', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }
        if (!isset($team_b['Scout2'])) {
            $team_b['Scout2'] = ['position' => 'Scout2', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0];
        }

        $results['team_a'][0] = $team_a['Commander'];
        $results['team_a'][1] = $team_a['Heavy Weapons'];
        $results['team_a'][2] = $team_a['Scout'];
        $results['team_a'][3] = $team_a['Scout2'];
        $results['team_a'][4] = $team_a['Ammo Carrier'];
        $results['team_a'][5] = $team_a['Medic'];

        $results['team_b'][0] = $team_b['Commander'];
        $results['team_b'][1] = $team_b['Heavy Weapons'];
        $results['team_b'][2] = $team_b['Scout'];
        $results['team_b'][3] = $team_b['Scout2'];
        $results['team_b'][4] = $team_b['Ammo Carrier'];
        $results['team_b'][5] = $team_b['Medic'];

        return $results;
    }

    public function getDatabaseStats()
    {
        return $this->find('first', [
            'fields' => [
                'COUNT(id) as total_scorecards',
                'SUM(shots_hit) as total_hits',
            ],
        ]);
    }

    protected function _loadMatrix($min_games, $min_days, $state)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $min_games = 9;
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        if ($min_days > 0 && isset($state['gametype']) && ('all' == $state['gametype'] || 'social' == $state['gametype'])) {
            $conditions['DATE_PART(\'day\', NOW() - game_datetime) <='] = $min_days;
        }

        $results = $this->find('all', [
            'fields' => [
                'player_id',
                'position',
                'AVG(mvp_points) as avg_mvp',
                'COUNT(game_datetime) as games_played',
            ],
            'conditions' => $conditions,
            'group' => "player_id, position HAVING COUNT(game_datetime) >= {$min_games}",
        ]);

        $matrix = [];

        foreach ($results as $key => $result) {
            $matrix[$result['Scorecard']['player_id']]['Ammo Carrier'] = 0.0;
            $matrix[$result['Scorecard']['player_id']]['Commander'] = 0.0;
            $matrix[$result['Scorecard']['player_id']]['Heavy Weapons'] = 0.0;
            $matrix[$result['Scorecard']['player_id']]['Medic'] = 0.0;
            $matrix[$result['Scorecard']['player_id']]['Scout'] = 0.0;
            $matrix[$result['Scorecard']['player_id']]['Scout2'] = 0.0;
        }

        foreach ($results as $key => $result) {
            $matrix[$result['Scorecard']['player_id']][$result['Scorecard']['position']] = (float) $result[0]['avg_mvp'];
            if ('Scout' == $result['Scorecard']['position']) {
                $matrix[$result['Scorecard']['player_id']]['Scout2'] = (float) $result[0]['avg_mvp'];
            }
        }

        return $matrix;
    }

    protected function _munkres($matrix)
    {
        //Munkres implementation
        $C = [];
        $C_orig = [];
        $M = [];
        $path = [];
        $RowCover = [];
        $colCover = [];
        $nrow = 0;
        $ncol = 0;
        $path_count = 0;
        $path_row_0 = 0;
        $path_col_0 = 0;
        $asgn = 0;
        $step = 1;

        foreach ($matrix as $row) {
            $ncol = 0;
            foreach ($row as $column) {
                $C[$nrow][$ncol] = $column;
                ++$ncol;
            }
            ++$nrow;
        }

        while ($ncol < $nrow) {
            for ($r = 0; $r < $nrow; ++$r) {
                $C[$r][$ncol] = 100;
            }
            ++$ncol;
        }

        for ($r = 0; $r < $nrow; ++$r) {
            $RowCover[$r] = 0;
            for ($c = 0; $c < $ncol; ++$c) {
                $M[$r][$c] = 0;
            }
        }
        for ($c = 0; $c < $ncol; ++$c) {
            $ColCover[$c] = 0;
        }

        $ovl_done = false;

        while (!$ovl_done) {
            switch ($step) {
                case 1:
                    $min_in_row = 0;

                    for ($r = 0; $r < $nrow; ++$r) {
                        $min_in_row = $C[$r][0];
                        for ($c = 0; $c < $ncol; ++$c) {
                            if ($C[$r][$c] < $min_in_row) {
                                $min_in_row = $C[$r][$c];
                            }
                        }
                        for ($c = 0; $c < $ncol; ++$c) {
                            $C[$r][$c] -= $min_in_row;
                        }
                    }
                    $step = 2;

                    break;
                case 2:
                    for ($r = 0; $r < $nrow; ++$r) {
                        for ($c = 0; $c < $ncol; ++$c) {
                            if (0 == $C[$r][$c] && 0 == $RowCover[$r] && 0 == $ColCover[$c]) {
                                $M[$r][$c] = 1;
                                $RowCover[$r] = 1;
                                $ColCover[$c] = 1;
                            }
                        }
                    }
                    for ($r = 0; $r < $nrow; ++$r) {
                        $RowCover[$r] = 0;
                    }
                    for ($c = 0; $c < $ncol; ++$c) {
                        $ColCover[$c] = 0;
                    }
                    $step = 3;

                    break;
                case 3:
                    $colcount = 0;
                    for ($r = 0; $r < $nrow; ++$r) {
                        for ($c = 0; $c < $ncol; ++$c) {
                            if (1 == $M[$r][$c]) {
                                $ColCover[$c] = 1;
                            }
                        }
                    }

                    $colcount = 0;
                    for ($c = 0; $c < $ncol; ++$c) {
                        if (1 == $ColCover[$c]) {
                            ++$colcount;
                        }
                    }
                    if ($colcount >= $ncol || $colcount >= $nrow) {
                        $step = 7;
                    } else {
                        $step = 4;
                    }

                    break;
                case 4:
                    $row = -1;
                    $col = -1;
                    $done = false;

                    while (!$done) {
                        $r = 0;
                        $c = 0;
                        $done2 = false;
                        $row = -1;
                        $col = -1;

                        //find_a_zero
                        while (!$done2) {
                            $c = 0;
                            while (true) {
                                if (0 == $C[$r][$c] && 0 == $RowCover[$r] && 0 == $ColCover[$c]) {
                                    $row = $r;
                                    $col = $c;
                                    $done2 = true;
                                }
                                ++$c;
                                if ($c >= $ncol || $done2) {
                                    break;
                                }
                            }
                            ++$r;
                            if ($r >= $nrow) {
                                $done2 = true;
                            }
                        }

                        if (-1 == $row) {
                            $done = true;
                            $step = 6;
                        } else {
                            $M[$row][$col] = 2;

                            //star_in_row
                            $tmp = false;
                            for ($tmp_c = 0; $tmp_c < $ncol; ++$tmp_c) {
                                if (1 == $M[$row][$tmp_c]) {
                                    $tmp = true;
                                }
                            }

                            if ($tmp) {
                                //find_star_in_row
                                $col = -1;
                                for ($tmp_c = 0; $tmp_c < $ncol; ++$tmp_c) {
                                    if (1 == $M[$row][$tmp_c]) {
                                        $col = $tmp_c;
                                    }
                                }

                                $RowCover[$row] = 1;
                                $ColCover[$col] = 0;
                            } else {
                                $done = true;
                                $step = 5;
                                $path_row_0 = $row;
                                $path_col_0 = $col;
                            }
                        }
                    }

                    break;
                case 5:
                    $done = false;
                    $r = -1;
                    $c = -1;

                    $path_count = 1;
                    $path[$path_count - 1][0] = $path_row_0;
                    $path[$path_count - 1][1] = $path_col_0;

                    while (!$done) {
                        //find_star_in_col
                        $tmp_c = $path[$path_count - 1][1];
                        $r = -1;
                        for ($i = 0; $i < $nrow; ++$i) {
                            if (1 == $M[$i][$tmp_c]) {
                                $r = $i;
                            }
                        }

                        if ($r > -1) {
                            ++$path_count;
                            $path[$path_count - 1][0] = $r;
                            $path[$path_count - 1][1] = $path[$path_count - 2][1];
                        } else {
                            $done = true;
                        }
                        if (!$done) {
                            //find_prime_in_row
                            $tmp_r = $path[$path_count - 1][0];
                            for ($j = 0; $j < $ncol; ++$j) {
                                if (2 == $M[$tmp_r][$j]) {
                                    $c = $j;
                                }
                            }

                            ++$path_count;
                            $path[$path_count - 1][0] = $path[$path_count - 2][0];
                            $path[$path_count - 1][1] = $c;
                        }
                    }
                    //augment_path();
                    for ($p = 0; $p < $path_count; ++$p) {
                        if (1 == $M[$path[$p][0]][$path[$p][1]]) {
                            $M[$path[$p][0]][$path[$p][1]] = 0;
                        } else {
                            $M[$path[$p][0]][$path[$p][1]] = 1;
                        }
                    }

                    //clear_covers();
                    for ($r = 0; $r < $nrow; ++$r) {
                        $RowCover[$r] = 0;
                    }
                    for ($c = 0; $c < $ncol; ++$c) {
                        $ColCover[$c] = 0;
                    }

                    //erase_primes();
                    for ($r = 0; $r < $nrow; ++$r) {
                        for ($c = 0; $c < $ncol; ++$c) {
                            if (2 == $M[$r][$c]) {
                                $M[$r][$c] = 0;
                            }
                        }
                    }

                    $step = 3;

                    break;
                case 6:
                    $minval = 100;

                    for ($r = 0; $r < $nrow; ++$r) {
                        for ($c = 0; $c < $ncol; ++$c) {
                            if (0 == $RowCover[$r] && 0 == $ColCover[$c]) {
                                if ($minval > $C[$r][$c]) {
                                    $minval = $C[$r][$c];
                                }
                            }
                        }
                    }

                    for ($r = 0; $r < $nrow; ++$r) {
                        for ($c = 0; $c < $ncol; ++$c) {
                            if (1 == $RowCover[$r]) {
                                $C[$r][$c] += $minval;
                            }
                            if (0 == $ColCover[$c]) {
                                $C[$r][$c] -= $minval;
                            }
                        }
                    }
                    $step = 4;

                    break;
                case 7:
                    $ovl_done = true;

                    break;
            }
        }

        return $M;
    }
}
