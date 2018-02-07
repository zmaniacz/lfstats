<?php
App::uses('AppModel', 'Model');

class EventTeam extends AppModel {
	public $displayField = 'name';

	public $belongsTo = array(
		'Event' => array(
			'className' => 'Event',
			'foreignKey' => 'event_id'
		),
		'Player' => array(
			'className' => 'Player',
			'foreignKey' => 'captain_id'
		)
	);
	
	public $hasMany = array(
		'Red_Game' => array(
			'className' => 'Game',
			'foreignKey' => 'red_team_id'
		),
		'Green_Game' => array(
			'className' => 'Game',
			'foreignKey' => 'green_team_id'
		),
		'Match_Team1' => array(
			'className' => 'Match',
			'foreignKey' => 'team_1_id'
		),
		'Match_Team2' => array(
			'className' => 'Match',
			'foreignKey' => 'team_2_id'
		)
	);

	public $hasAndBelongsToMany = array(
		'Player' => array(
			'className' => 'Player',
			'joinTable' => 'players_teams',
			'foreignKey' => 'team_id',
			'associationForeignKey' => 'player_id',
			'unique' => 'keepExisting'
		)
	);
	
	public function getTeamMatches($team_id, $state) {
		$event_id = $state['leagueID'];
		
		$rounds = $this->Event->find('first',array(
			'contain' => array(
				'Round' => array(
					'Match' => array(
						'Game_1',
						'Game_2',
						'conditions' => array(
							'OR' => array(
								'Match.team_1_id' => $team_id,
								'Match.team_2_id' => $team_id
							)
						)
					)
				)
			),
			'conditions' => array(
				'Event.id' => $event_id
			)
		));
		
		return $rounds;
	}

}
