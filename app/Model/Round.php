<?php

class Round extends AppModel {
	public $hasMany = array(
		'Match' => array(
			'className' => 'Match',
			'foreignkey' => 'round_id'
		)
	);

	public $belongsTo = array(
		'Event' => array(
			'className' => 'Event',
			'foreignKey' => 'event_id'
		)
	);
}