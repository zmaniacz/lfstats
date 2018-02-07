<?php
App::uses('AppModel', 'Model');

class PlayersName extends AppModel {

	public $displayField = 'player_name';

	public $belongsTo = array(
		'Player' => array(
			'className' => 'Player',
			'foreignKey' => 'player_id'
		)
	);
}
