<?php

App::uses('AppModel', 'Model');

class GameDelta extends AppModel
{
    public $belongsTo = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'game_id',
        ],
        'GameTeam' => [
            'className' => 'GameTeam',
            'foreignKey' => 'team_id',
        ],
        'Player' => [
            'className' => 'Player',
            'foreignKey' => 'player_id',
        ],
    ];
}
