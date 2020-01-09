<?php

App::uses('AppModel', 'Model');

class GameLog extends AppModel
{
    public $belongsTo = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'game_id',
        ],
    ];
}
