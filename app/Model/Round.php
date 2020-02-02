<?php

class Round extends AppModel
{
    public $hasMany = [
        'Match' => [
            'className' => 'Match',
            'foreignKey' => 'round_id',
            'order' => 'Match.match ASC',
        ],
    ];

    public $belongsTo = [
        'Event' => [
            'className' => 'Event',
            'foreignKey' => 'event_id',
        ],
    ];
}
