<?php

class Center extends AppModel
{
    public $hasMany = [
        'Scorecard' => [
            'className' => 'Scorecard',
            'foreignKey' => 'center_id',
        ],
        'Player' => [
            'className' => 'Player',
            'foreignKey' => 'center_id',
        ],
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'center_id',
        ],
    ];

    public function getCenterDetails($short_name)
    {
        return $this->find('first', [
            'fields' => ['id', 'type'],
            'conditions' => ['short_name' => $short_name],
        ]);
    }
}
