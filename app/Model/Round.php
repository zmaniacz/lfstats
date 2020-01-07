<?php

class Round extends AppModel
{
    public $hasMany = [
        'Match' => [
            'className' => 'Match',
            'foreignKey' => 'round_id',
        ],
    ];

    public $belongsTo = [
        'Event' => [
            'className' => 'Event',
            'foreignKey' => 'event_id',
        ],
    ];
}
