<?php
App::uses('AppModel', 'Model');

class EventPlayer extends AppModel
{
    public $displayField = 'name';

    public $belongsTo = array(
        'Event' => array(
            'className' => 'Event',
            'foreignKey' => 'event_id'
        ),
        'Player' => array(
            'className' => 'Player',
            'foreignKey' => 'player_id'
        )
    );
}
