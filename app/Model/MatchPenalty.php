<?php
App::uses('AppModel', 'Model');

class MatchPenalty extends AppModel {
	public $displayField = 'type';

	public $belongsTo = array(
		'EventTeam' => array(
			'className' => 'EventTeam',
			'foreignKey' => 'team_id'
		)
	);
}
