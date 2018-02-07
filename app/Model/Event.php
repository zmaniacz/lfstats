<?php
App::uses('AppModel', 'Model');

class Event extends AppModel {

	public $displayField = 'name';

	public $belongsTo = array(
		'Center' => array(
			'className' => 'Center',
			'foreignKey' => 'center_id'
		)
	);

	public $hasMany = array(
		'Game' => array(
			'className' => 'Game',
			'foreignKey' => 'event_id'
		),
		'EventTeam' => array(
			'className' => 'EventTeam',
			'foreignKey' => 'event_id'
		),
		'Round' => array(
			'className' => 'Round',
			'foreignkey' => 'event_id'
		)
	);

	public function getEventList($type = null, $limit = null, $center_id = null) {
		$conditions[] = array();
		
		if(isset($type)) {
			if($type == 'social')
				$conditions[] = array('Event.is_comp' => 0);
			elseif($type == 'comp')
				$conditions[] = array('Event.is_comp' => 1);
		}

		if(isset($center_id) && $center_id > 0)
			$conditions[] = array('Event.center_id' => $center_id);
		
		$this->virtualFields['last_gamedate'] = 0;
		$this->virtualFields['games_played'] = 0;

		$options = array(
			'fields' => array(
				'Event.id',
				'Event.name',
				'Event.description',
				'Event.type',
				'Event.is_comp',
				'Event.center_id',
				'Center.id',
				'Center.name',
				'Center.short_name',
				'DATE(MAX(Game.game_datetime)) as Event__last_gamedate',
				'COUNT(Game.game_datetime) as Event__games_played'
			),
			'joins' => array(
				array(
					'table' => 'games',
					'alias' => 'Game',
					'type' => 'LEFT',
					'conditions' => array(
						'Event.id = Game.event_id'
					)
				),
				array(
					'table' => 'centers',
					'alias' => 'Center',
					'type' => 'LEFT',
					'conditions' => array(
						'Event.center_id = Center.id'
					)
				)
			),
			'conditions' => $conditions,
			'group' => 'Event.id',
			'order' => 'Event__last_gamedate DESC'
		);

		if(isset($limit))
			$options['limit'] = $limit;

		$events = $this->find('all', $options);

		return $events;
	}

	public function getLeagueList() {
		$leagues = $this->find('list', array(
			'conditions' => array('is_comp' => true)
		));

		return $leagues;
	}

	public function getLeagueDetailList() {
		$leagues = $this->find('all', array(
			'conditions' => array('is_comp' => true),
			'order' => 'id DESC'
		));

		return $leagues;
	}

	public function getLeagues($state) {
		$leagues = $this->find('all', array(
			'contain' => array(
				'Center'
			),
			'conditions' => array('is_comp' => true),
			'order' => 'Event.name ASC'
		));

		return $leagues;
	}

	public function getTeamStandings($state, $round = null) {
		$conditions = array();
		$round_conditions = array();
		
		$conditions[] = array('EventTeam.event_id' => $state['leagueID']);
		$round_conditions[] = array('Round.is_finals' => '0');

		if(isset($round)) {
			$round_conditions[] = array('Round.round' => $round);
		}
		
		$rounds = $this->find('first', array(
			'contain' => array(
				'Round' => array(
					'Match' => array(
						'Game_1',
						'Game_2'
					),
					'conditions' => $round_conditions
				)
			),
			'conditions' => array('id' => $state['leagueID']),
			'orderby' => 'Round.round ASC'
		));
		
		$teams = $this->EventTeam->find('list', array('conditions' => array('EventTeam.event_id' => $state['leagueID'])));
		
		$standings = array();
		
		foreach($teams as $id => $name) {
			$standings[$id] = array('id' => $id, 'name' => $name, 'points' => 0, 'played' => 0, 'won' => 0, 'lost' => 0, 'matches_played' => 0, 'matches_won' => 0, 'elims' => 0, 'for' => 0, 'against' => 0, 'ratio' => 0);
		}
		
		
		foreach($rounds['Round'] as $round) {
			foreach($round['Match'] as $match) {
				//Overall match points
				if(isset($match['team_1_id']) && isset($match['team_2_id'])) {
					$standings[$match['team_1_id']]['points'] += $match['team_1_points'];
					$standings[$match['team_2_id']]['points'] += $match['team_2_points'];
					
					//Matches Won
					if(!is_null($match['team_1_points']) && !is_null($match['team_2_points'])) {
						if($match['team_1_points'] + $match['team_2_points'] == 6) {
							if($match['team_1_points'] > $match['team_2_points'])
								$standings[$match['team_1_id']]['matches_won'] += 1;
							elseif($match['team_1_points'] < $match['team_2_points'])
								$standings[$match['team_2_id']]['matches_won'] += 1;
						}
					}
					
					if(!empty($match['Game_1'])) {
						if($match['Game_1']['winner'] == 'red') {
							$standings[$match['team_1_id']]['won'] += 1;
							$standings[$match['team_2_id']]['lost'] += 1;
						} else {
							$standings[$match['team_1_id']]['lost'] += 1;
							$standings[$match['team_2_id']]['won'] += 1;
						}
						
						$standings[$match['team_1_id']]['for'] += $match['Game_1']['red_score'] + $match['Game_1']['red_adj'];
						$standings[$match['team_2_id']]['against'] += $match['Game_1']['red_score'] + $match['Game_1']['red_adj'];
						$standings[$match['team_2_id']]['for'] += $match['Game_1']['green_score'] + $match['Game_1']['green_adj'];
						$standings[$match['team_1_id']]['against'] += $match['Game_1']['green_score'] + $match['Game_1']['green_adj'];
						
						$standings[$match['team_1_id']]['played'] += 1;
						$standings[$match['team_2_id']]['played'] += 1;
						
						if($match['Game_1']['red_eliminated'])
							$standings[$match['team_2_id']]['elims'] += 1;
						
						if($match['Game_1']['green_eliminated'])
							$standings[$match['team_1_id']]['elims'] += 1;
					}
					
					if(!empty($match['Game_2'])) {
						if($match['Game_2']['winner'] == 'red') {
							$standings[$match['team_2_id']]['won'] += 1;
							$standings[$match['team_1_id']]['lost'] += 1;
						} else {
							$standings[$match['team_2_id']]['lost'] += 1;
							$standings[$match['team_1_id']]['won'] += 1;
						}
						
						$standings[$match['team_2_id']]['for'] += $match['Game_2']['red_score'] + $match['Game_2']['red_adj'];
						$standings[$match['team_1_id']]['against'] += $match['Game_2']['red_score'] + $match['Game_2']['red_adj'];
						$standings[$match['team_1_id']]['for'] += $match['Game_2']['green_score'] + $match['Game_2']['green_adj'];
						$standings[$match['team_2_id']]['against'] += $match['Game_2']['green_score'] + $match['Game_2']['green_adj'];
						
						$standings[$match['team_1_id']]['played'] += 1;
						$standings[$match['team_2_id']]['played'] += 1;
						
						if($match['Game_2']['red_eliminated'])
							$standings[$match['team_1_id']]['elims'] += 1;
						
						if($match['Game_2']['green_eliminated'])
							$standings[$match['team_2_id']]['elims'] += 1;
					}
				}
			}
		}
		
		foreach($standings as &$standing) {
			if($standing['against'] > 0)
				$standing['ratio'] = $standing['for']/$standing['against'];
			
			$standing['matches_played'] = $standing['played']/2;
		}
		
		if(!empty($standings)) {
			foreach ($standings as $key => $row) {
			    $arr_points[$key]  = $row['points'];
				$arr_ratio[$key]  = $row['ratio'];
			}
			
			array_multisort($arr_points, SORT_DESC, $arr_ratio, SORT_DESC, $standings);
		}
		
		return $standings;
	}

	public function getTeams($league_id) {
		$teams = $this->EventTeam->find('list', array(
			'conditions' => array(
				'event_id' => $league_id
			),
			'order' => 'name ASC'
		));

		return $teams;
	}
	
	public function getLeagueDetails($state) {
		$event_id = $state['leagueID'];
		
		$rounds = $this->find('first',array(
			'contain' => array(
				'Round' => array(
					'Match' =>array(
						'Game_1',
						'Game_2'
					)
				)
			),
			'conditions' => array(
				'Event.id' => $event_id
			)
		));
		
		return $rounds;
	}

	public function getAvailableMatches($game = null) {
		$conditions = array();
		$match_list = array();
		
		if(!is_null($game)) {
			if(!is_null($game['Game']['red_team_id'])) {
				$conditions[] = array('OR' => array(
					array(
						'Game_1.id' => null,
						'Match.team_1_id' => $game['Game']['red_team_id']
					),
					array(
						'Game_2.id' => null,
						'Match.team_2_id' => $game['Game']['red_team_id']
					)
				));
			} else {
				$conditions = array(
					'OR' => array(
						'Game_1.id' => null,
						'Game_2.id' => null
					),
					'AND' => array(
						'Match.team_1_id NOT' => null,
						'Match.team_2_id NOT' => null,
					)
				);
			}
		}
		
		$event = $this->find('first', array(
			'contain' => array(
				'Round' => array(
					'Match' => array(
						'Game_1' => array('fields' => array('id')),
						'Game_2' => array('fields' => array('id')),
						'Team_1' => array('fields' => array('id', 'name')),
						'Team_2' => array('fields' => array('id', 'name')),
					)
				)
			),
			'conditions' => array('Event.id' => $game['Game']['event_id'])
		));

		foreach($event['Round'] as &$round) {
			foreach($round['Match'] as $key => $match) {
				if(empty($match['Team_1']) || empty($match['Team_2']) || (!empty($match['Game_1']) && !empty($match['Game_2']))) {
					if($match['id'] != $game['Game']['match_id'])
						unset($round['Match'][$key]);
				}
			}
		}

		return $event;
	}
}
