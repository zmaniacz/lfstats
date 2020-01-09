<?php

App::uses('AppModel', 'Model');

class GameAction extends AppModel
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
        'Actor' => [
            'className' => 'Player',
            'foreignKey' => 'player_id',
        ],
        'Target' => [
            'className' => 'Player',
            'foreignKey' => 'target_id',
        ],
    ];
}
