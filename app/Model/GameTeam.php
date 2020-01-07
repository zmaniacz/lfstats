<?php

App::uses('AppModel', 'Model');

class GameTeam extends AppModel
{
    public $belongsTo = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'game_id',
        ],
    ];
}
