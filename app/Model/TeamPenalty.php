<?php
App::uses('AppModel', 'Model');

class TeamPenalty extends AppModel {
	public $displayField = 'type';

	public $belongsTo = array(
		'Game' => array(
			'className' => 'Game',
			'foreignKey' => 'game_id'
		)
	);
}
