<?php

App::uses('AppModel', 'Model');

class TeamDelta extends AppModel
{
    public $belongsTo = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'game_id',
        ],
    ];
}
