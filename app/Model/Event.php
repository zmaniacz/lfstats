<?php

App::uses('AppModel', 'Model');

class Event extends AppModel
{
    public $displayField = 'name';

    public $belongsTo = [
        'Center' => [
            'className' => 'Center',
            'foreignKey' => 'center_id',
        ],
    ];

    public $hasMany = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'event_id',
        ],
        'EventTeam' => [
            'className' => 'EventTeam',
            'foreignKey' => 'event_id',
        ],
        'EventPlayer' => [
            'className' => 'EventPlayer',
            'foreignKey' => 'event_id',
        ],
        'Round' => [
            'className' => 'Round',
            'foreignKey' => 'event_id',
            'order' => 'Round.round ASC',
        ],
        'SoloStanding' => [
            'className' => 'SoloStanding',
            'foreignKey' => 'event_id',
        ],
    ];

    public function getEventList($type = null, $limit = null, $center_id = null)
    {
        $conditions[] = [];

        if (isset($type)) {
            if ('social' == $type) {
                $conditions[] = ['Event.is_comp' => 0];
            } elseif ('comp' == $type) {
                $conditions[] = ['Event.is_comp' => 1];
            }
        }

        if (isset($center_id) && $center_id > 0) {
            $conditions[] = ['Event.center_id' => $center_id];
        }

        $this->virtualFields['last_gamedate'] = 0;
        $this->virtualFields['games_played'] = 0;

        $options = [
            'fields' => [
                'Event.id',
                'Event.name',
                'Event.description',
                'Event.type',
                'Event.is_comp',
                'Event.center_id',
                'Center.id',
                'Center.name',
                'Center.short_name',
                'DATE(MAX(Game.game_datetime)) AS "Event__last_gamedate"',
                'COUNT(Game.id) AS "Event__games_played"',
            ],
            'joins' => [
                [
                    'table' => 'games',
                    'alias' => 'Game',
                    'type' => 'LEFT',
                    'conditions' => [
                        'Event.id = Game.event_id',
                    ],
                ],
                [
                    'table' => 'centers',
                    'alias' => 'Center',
                    'type' => 'LEFT',
                    'conditions' => [
                        'Event.center_id = Center.id',
                    ],
                ],
            ],
            'conditions' => $conditions,
            'group' => 'Event.id, Center.id',
            'order' => 'Event__last_gamedate DESC NULLS LAST',
        ];

        if (isset($limit)) {
            $options['limit'] = $limit;
        }

        return $this->find('all', $options);
    }

    public function getLeagueList()
    {
        return $this->find('list', [
            'conditions' => ['is_comp' => true],
        ]);
    }

    public function getLeagueDetailList()
    {
        return $this->find('all', [
            'conditions' => ['is_comp' => true],
            'order' => 'id DESC',
        ]);
    }

    public function getLeagues($state)
    {
        return $this->find('all', [
            'contain' => [
                'Center',
            ],
            'conditions' => ['is_comp' => true],
            'order' => 'Event.name ASC',
        ]);
    }

    public function getTeamStandings($state, $round = null)
    {
        $conditions = [];
        $round_conditions = [];

        $conditions[] = ['EventTeam.event_id' => $state['leagueID']];
        $round_conditions[] = ['Round.is_finals' => '0'];

        if (isset($round)) {
            $round_conditions[] = ['Round.round' => $round];
        }

        $rounds = $this->find('first', [
            'contain' => [
                'Round' => [
                    'Match' => [
                        'Game_1',
                        'Game_2',
                    ],
                    'conditions' => $round_conditions,
                ],
            ],
            'conditions' => ['id' => $state['leagueID']],
            'orderby' => 'Round.round ASC',
        ]);

        $teams = $this->EventTeam->find('list', ['conditions' => ['EventTeam.event_id' => $state['leagueID']]]);

        $standings = [];

        foreach ($teams as $id => $name) {
            $standings[$id] = ['id' => $id, 'name' => $name, 'raw_points' => 0, 'points' => 0, 'adjustment' => null, 'played' => 0, 'won' => 0, 'lost' => 0, 'matches_played' => 0, 'matches_won' => 0, 'elims' => 0, 'for' => 0, 'against' => 0, 'ratio' => 0];
        }

        foreach ($rounds['Round'] as $round) {
            foreach ($round['Match'] as $match) {
                //Overall match points
                if (isset($match['team_1_id'], $match['team_2_id'])) {
                    $standings[$match['team_1_id']]['raw_points'] += $match['team_1_points'];
                    $standings[$match['team_2_id']]['raw_points'] += $match['team_2_points'];

                    //Matches Won
                    if (!is_null($match['team_1_points']) && !is_null($match['team_2_points'])) {
                        if ($match['team_1_points'] + $match['team_2_points'] == (6 * $round['Round']['multiplier'])) {
                            if ($match['team_1_points'] > $match['team_2_points']) {
                                ++$standings[$match['team_1_id']]['matches_won'];
                            } elseif ($match['team_1_points'] < $match['team_2_points']) {
                                ++$standings[$match['team_2_id']]['matches_won'];
                            }
                        }
                    }

                    if (!empty($match['Game_1'])) {
                        if ('red' == $match['Game_1']['winner']) {
                            ++$standings[$match['team_1_id']]['won'];
                            ++$standings[$match['team_2_id']]['lost'];
                        } else {
                            ++$standings[$match['team_1_id']]['lost'];
                            ++$standings[$match['team_2_id']]['won'];
                        }

                        $standings[$match['team_1_id']]['for'] += $match['Game_1']['red_score'] + $match['Game_1']['red_adj'];
                        $standings[$match['team_2_id']]['against'] += $match['Game_1']['red_score'] + $match['Game_1']['red_adj'];
                        $standings[$match['team_2_id']]['for'] += $match['Game_1']['green_score'] + $match['Game_1']['green_adj'];
                        $standings[$match['team_1_id']]['against'] += $match['Game_1']['green_score'] + $match['Game_1']['green_adj'];

                        ++$standings[$match['team_1_id']]['played'];
                        ++$standings[$match['team_2_id']]['played'];

                        if ($match['Game_1']['red_eliminated']) {
                            ++$standings[$match['team_2_id']]['elims'];
                        }

                        if ($match['Game_1']['green_eliminated']) {
                            ++$standings[$match['team_1_id']]['elims'];
                        }
                    }

                    if (!empty($match['Game_2'])) {
                        if ('red' == $match['Game_2']['winner']) {
                            ++$standings[$match['team_2_id']]['won'];
                            ++$standings[$match['team_1_id']]['lost'];
                        } else {
                            ++$standings[$match['team_2_id']]['lost'];
                            ++$standings[$match['team_1_id']]['won'];
                        }

                        $standings[$match['team_2_id']]['for'] += $match['Game_2']['red_score'] + $match['Game_2']['red_adj'];
                        $standings[$match['team_1_id']]['against'] += $match['Game_2']['red_score'] + $match['Game_2']['red_adj'];
                        $standings[$match['team_1_id']]['for'] += $match['Game_2']['green_score'] + $match['Game_2']['green_adj'];
                        $standings[$match['team_2_id']]['against'] += $match['Game_2']['green_score'] + $match['Game_2']['green_adj'];

                        ++$standings[$match['team_1_id']]['played'];
                        ++$standings[$match['team_2_id']]['played'];

                        if ($match['Game_2']['red_eliminated']) {
                            ++$standings[$match['team_1_id']]['elims'];
                        }

                        if ($match['Game_2']['green_eliminated']) {
                            ++$standings[$match['team_2_id']]['elims'];
                        }
                    }
                }
            }
        }

        foreach ($standings as &$standing) {
            if ($standing['against'] > 0) {
                $standing['ratio'] = $standing['for'] / $standing['against'];
            }

            $standing['matches_played'] = $standing['played'] / 2;

            //retrieve any team penalties and update points total
            $standing['points'] = $standing['raw_points'];
            $team = $this->EventTeam->find('first', [
                'contain' => [
                    'MatchPenalty',
                ],
                'conditions' => [
                    'id' => $standing['id'],
                ],
            ]);

            if (!empty($team['MatchPenalty'])) {
                $adj = 0;
                foreach ($team['MatchPenalty'] as $penalty) {
                    $adj += $penalty['value'];
                }
                $standing['adjustment'] = $adj;
                $standing['points'] += $adj;
            }
        }

        if (!empty($standings)) {
            foreach ($standings as $key => $row) {
                $arr_points[$key] = $row['points'];
                $arr_ratio[$key] = $row['ratio'];
            }

            array_multisort($arr_points, SORT_DESC, $arr_ratio, SORT_DESC, $standings);
        }

        return $standings;
    }

    public function getTeams($league_id)
    {
        return $this->EventTeam->find('list', [
            'conditions' => [
                'event_id' => $league_id,
            ],
            'order' => 'name ASC',
        ]);
    }

    public function getLeagueDetails($state)
    {
        $event_id = $state['leagueID'];

        return $this->find('first', [
            'contain' => [
                'Round' => [
                    'Match' => [
                        'Game_1',
                        'Game_2',
                    ],
                ],
            ],
            'conditions' => [
                'Event.id' => $event_id,
            ],
        ]);
    }

    public function getAvailableMatches($game = null)
    {
        $conditions = [];
        $match_list = [];

        if (!is_null($game)) {
            if (!is_null($game['Game']['red_team_id'])) {
                $conditions[] = ['OR' => [
                    [
                        'Game_1.id' => null,
                        'Match.team_1_id' => $game['Game']['red_team_id'],
                    ],
                    [
                        'Game_2.id' => null,
                        'Match.team_2_id' => $game['Game']['red_team_id'],
                    ],
                ]];
            } else {
                $conditions = [
                    'OR' => [
                        'Game_1.id' => null,
                        'Game_2.id' => null,
                    ],
                    'AND' => [
                        'Match.team_1_id NOT' => null,
                        'Match.team_2_id NOT' => null,
                    ],
                ];
            }
        }

        $event = $this->find('first', [
            'contain' => [
                'Round' => [
                    'Match' => [
                        'Game_1' => ['fields' => ['id']],
                        'Game_2' => ['fields' => ['id']],
                        'Team_1' => ['fields' => ['id', 'name']],
                        'Team_2' => ['fields' => ['id', 'name']],
                    ],
                ],
            ],
            'conditions' => ['Event.id' => $game['Game']['event_id']],
        ]);

        foreach ($event['Round'] as &$round) {
            foreach ($round['Match'] as $key => $match) {
                if (empty($match['Team_1']) || empty($match['Team_2']) || (!empty($match['Game_1']) && !empty($match['Game_2']))) {
                    if ($match['id'] != $game['Game']['match_id']) {
                        unset($round['Match'][$key]);
                    }
                }
            }
        }

        return $event;
    }

    public function getSoloStandings($eventId)
    {
        $standings = $this->SoloStanding->find('all', [
            'fields' => [
                'id',
                'player_id',
                'handicap',
                'sum(games_played) as games_played',
                'sum(mvp_total) as all_mvp_total',
                'sum(raw_mvp_total) as raw_mvp_total',
            ],
            'contain' => [
                'Player' => [
                    'fields' => ['id', 'player_name'],
                ],
            ],
            'conditions' => [
                'event_id' => $eventId,
            ],
            'group' => 'SoloStanding.id, SoloStanding.player_id, SoloStanding.handicap, Player.id',
        ]);

        $averages = $this->find(
            'all',
            [
                'fields' => [
                    'Scorecard.player_id',
                    'AVG(Scorecard.score) as avg_score',
                    'AVG(Scorecard.mvp_points) as avg_mvp',
                ],
                'conditions' => [
                    'Event.id' => $eventId,
                ],
                'joins' => [
                    [
                        'table' => 'games',
                        'alias' => 'Game',
                        'type' => 'LEFT',
                        'conditions' => [
                            'Game.event_id = Event.id',
                        ],
                    ],
                    [
                        'table' => 'scorecards',
                        'alias' => 'Scorecard',
                        'type' => 'LEFT',
                        'conditions' => [
                            'Scorecard.game_id = Game.id',
                        ],
                    ],
                ],
                'group' => 'Scorecard.player_id',
            ]
        );

        $data = [];

        foreach ($standings as $standing) {
            foreach ($averages as $average) {
                if ($standing['SoloStanding']['player_id'] == $average['Scorecard']['player_id']) {
                    $data[] = [
                        'id' => $standing['SoloStanding']['id'],
                        'player_id' => $standing['SoloStanding']['player_id'],
                        'player_name' => $standing['Player']['player_name'],
                        'avg_score' => $average[0]['avg_score'],
                        'avg_mvp' => $average[0]['avg_mvp'],
                        'handicap' => $standing['SoloStanding']['handicap'],
                        'games_played' => $standing[0]['games_played'],
                        'all_mvp_total' => $standing[0]['all_mvp_total'],
                        'raw_mvp_total' => $standing[0]['raw_mvp_total'],
                    ];

                    break;
                }
            }
        }

        return $data;
    }
}
