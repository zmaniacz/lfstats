<?php
App::uses('AppModel', 'Model');
/**
 * Penalty Model
 *
 * @property Scorecard $Scorecard
 */
class Penalty extends AppModel {

/**
 * Display field
 *
 * @var string
 */
	public $displayField = 'type';

	//The Associations below have been created with all possible keys, those that are not needed can be removed

/**
 * belongsTo associations
 *
 * @var array
 */
	public $belongsTo = array(
		'Scorecard' => array(
			'className' => 'Scorecard',
			'foreignKey' => 'scorecard_id'
		)
	);
	
	public function getPenalties($state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);
	
		$penalties = $this->find('all', array(
			'contain' => array(
				'Scorecard' => array(
					'fields' => array('type','center_id','event_id'),
					'Game' => array(
						'fields' => array('id','game_name','game_description','game_datetime','league_game'),
						'Match' => array(
							'Round'
						),
						'Red_Team',
						'Green_Team'
					),
					'Player' => array(
						'fields' => array('id','player_name')
					),
				)
			),
			'conditions' => $conditions			
		));
		
		return $penalties;
	}
}
