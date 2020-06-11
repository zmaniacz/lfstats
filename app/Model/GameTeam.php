<?php

App::uses('AppModel', 'Model');

class GameTeam extends AppModel
{
    public $useTable = 'v_game_teams';

    public $belongsTo = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'game_id',
        ],
    ];

    public $hasMany = [
        'Scorecard' => [
            'className' => 'Scorecard',
            'foreignKey' => 'team_id',
        ],
    ];
}
