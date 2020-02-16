<?php

App::uses('AppModel', 'Model');

class SoloStanding extends AppModel
{
    public $belongsTo = [
        'Event' => [
            'className' => 'Event',
            'foreignKey' => 'event_id',
        ],
        'Player' => [
            'className' => 'Player',
            'foreignKey' => 'player_id',
        ],
    ];
}
