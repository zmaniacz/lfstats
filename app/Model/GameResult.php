<?php

class GameResult extends AppModel {
    public $belongsTo = array(
		'Player' => array(
			'className' => 'Player',
			'foreignKey' => 'player_id'
		),
		'Game' => array(
			'className' => 'Game',
			'foreignKey' => 'game_id'
		),
		'Scorecard' => array(
			'className' => 'Scorecard',
			'foreignKey' => 'scorecard_id'
		)
	);
}