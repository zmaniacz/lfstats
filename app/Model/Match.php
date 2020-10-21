<?php

//we define team 1 to be the team that plays red in game 1 of the match
class Match extends AppModel
{
    public $hasMany = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'match_id',
        ],
    ];

    public $hasOne = [
        'Game_1' => [
            'className' => 'Game',
            'foreignKey' => 'match_id',
            'conditions' => [
                'Game_1.league_game' => 1,
            ],
        ],
        'Game_2' => [
            'className' => 'Game',
            'foreignKey' => 'match_id',
            'conditions' => [
                'Game_2.league_game' => 2,
            ],
        ],
    ];

    public $belongsTo = [
        'Round' => [
            'className' => 'Round',
            'foreignKey' => 'round_id',
        ],
        'Team_1' => [
            'className' => 'EventTeam',
            'foreignKey' => 'team_1_id',
        ],
        'Team_2' => [
            'className' => 'EventTeam',
            'foreignKey' => 'team_2_id',
        ],
    ];

    public function addGame($match_id, $game_number, $game_id)
    {
        $game = $this->Game->findById($game_id);

        if (0 == $match_id) {
            $old_match_id = $game['Game']['match_id'];

            $game['Game']['match_id'] = null;
            $game['Game']['red_team_id'] = null;
            $game['Game']['green_team_id'] = null;
            $game['Game']['league_game'] = null;

            $this->Game->save($game);
            $this->updatePoints($old_match_id);
        } else {
            $match = $this->find('first', [
                'contain' => [
                    'Game_1',
                    'Game_2',
                    'Team_1',
                    'Team_2',
                ],
                'conditions' => [
                    'Match.id' => $match_id,
                ],
            ]);

            $game['Game']['match_id'] = $match['Match']['id'];

            if (1 == $game_number) {
                $game['Game']['red_team_id'] = $match['Team_1']['id'];
                $game['Game']['green_team_id'] = $match['Team_2']['id'];
                $game['Game']['league_game'] = 1;
            } elseif (2 == $game_number) {
                $game['Game']['red_team_id'] = $match['Team_2']['id'];
                $game['Game']['green_team_id'] = $match['Team_1']['id'];
                $game['Game']['league_game'] = 2;
            }

            $this->Game->save($game);
            $this->updatePoints($match_id);
        }
    }

    public function updatePoints($match_id)
    {
        $match = $this->find('first', [
            'contain' => [
                'Game_1',
                'Game_2',
                'Team_1',
                'Team_2',
                'Round',
            ],
            'conditions' => [
                'Match.id' => $match_id,
            ],
        ]);

        $team_1_points = 0;
        $team_2_points = 0;

        if (!empty($match['Game_1']['id'])) {
            if ('red' == $match['Game_1']['winner']) {
                $team_1_points += 2;
            } elseif ('green' == $match['Game_1']['winner']) {
                $team_2_points += 2;
            }
        }

        if (!empty($match['Game_2']['id'])) {
            if ('red' == $match['Game_2']['winner']) {
                $team_2_points += 2;
            } elseif ('green' == $match['Game_2']['winner']) {
                $team_1_points += 2;
            }
        }

        //both games are logged
        if (!empty($match['Game_1']['id']) && !empty($match['Game_2']['id'])) {
            if ($team_1_points == $team_2_points) {
                //tie round, goes to score
                $team_1_total_score = $match['Game_1']['red_score'] + $match['Game_1']['red_adj'] + $match['Game_2']['green_score'] + $match['Game_2']['green_adj'];
                $team_2_total_score = $match['Game_1']['green_score'] + $match['Game_1']['green_adj'] + $match['Game_2']['red_score'] + $match['Game_2']['red_adj'];

                if ($team_1_total_score > $team_2_total_score) {
                    $team_1_points += 2;
                } elseif ($team_1_total_score < $team_2_total_score) {
                    $team_2_points += 2;
                } else {
                    ++$team_1_points;
                    ++$team_2_points;
                }
            } elseif ($team_1_points > $team_2_points) {
                $team_1_points += 2;
            } else {
                $team_2_points += 2;
            }
        }

        $match['Match']['team_1_points'] = $team_1_points * $match['Match']['multiplier'];
        $match['Match']['team_2_points'] = $team_2_points * $match['Match']['multiplier'];
        $this->save($match);
    }
}
