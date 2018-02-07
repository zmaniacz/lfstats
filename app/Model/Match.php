<?php
//we define team 1 to be the team that plays red in game 1 of the match
class Match extends AppModel {
	public $hasMany = array(
		'Game' => array(
			'className' => 'Game',
			'foreignkey' => 'match_id'
		)
	);
	
	public $hasOne = array(
		'Game_1' => array(
			'className' => 'Game',
			'foreignKey' => 'match_id',
			'conditions' => array(
				'Game_1.league_game' => 1
			)
		),
		'Game_2' => array(
			'className' => 'Game',
			'foreignKey' => 'match_id',
			'conditions' => array(
				'Game_2.league_game' => 2
			)
		)
	);

	public $belongsTo = array(
		'Round' => array(
			'className' => 'Round',
			'foreignKey' => 'round_id'
		),
		'Team_1' => array(
			'className' => 'EventTeam',
			'foreignKey' => 'team_1_id'
		),
		'Team_2' => array(
			'className' => 'EventTeam',
			'foreignKey' => 'team_2_id'
		)
	);
	
	public function addGame($match_id, $game_number, $game_id) {
		
		$match = $this->find('first', array(
			'contain' => array(
				'Game_1',
				'Game_2',
				'Team_1',
				'Team_2'
			),
			'conditions' => array(
				'Match.id' => $match_id
			)
		));
		
		$game = $this->Game->findById($game_id);
		
		//do we know who these teams are?
		if(!empty($game['Game']['red_team_id'])) {
			//is this game 1?
			if($match['Team_1']['id'] == $game['Game']['red_team_id']) {
				//yes it is
				$game['Game']['match_id'] = $match['Match']['id'];
				$game['Game']['red_team_id'] = $match['Team_1']['id'];
				$game['Game']['green_team_id'] = $match['Team_2']['id'];
				$game['Game']['league_game'] = 1;
			} elseif($match['Team_1']['id'] == $game['Game']['green_team_id']) {
				//nope it's game 2
				$game['Game']['match_id'] = $match['Match']['id'];
				$game['Game']['red_team_id'] = $match['Team_2']['id'];
				$game['Game']['green_team_id'] = $match['Team_1']['id'];
				$game['Game']['league_game'] = 2;
			}
		} else {
			if($game_number == 1) {
				$game['Game']['match_id'] = $match['Match']['id'];
				$game['Game']['red_team_id'] = $match['Team_1']['id'];
				$game['Game']['green_team_id'] = $match['Team_2']['id'];
				$game['Game']['league_game'] = 1;
			} elseif($game_number == 2) {
				$game['Game']['match_id'] = $match['Match']['id'];
				$game['Game']['red_team_id'] = $match['Team_2']['id'];
				$game['Game']['green_team_id'] = $match['Team_1']['id'];
				$game['Game']['league_game'] = 2;
			}
		}
		$this->Game->save($game);
		$this->updatePoints($match_id);
	}
	
	public function updatePoints($match_id) {
		$match = $this->find('first', array(
			'contain' => array(
				'Game_1',
				'Game_2',
				'Team_1',
				'Team_2'
			),
			'conditions' => array(
				'Match.id' => $match_id
			)
		));

		$team_1_points = 0;
		$team_2_points = 0;
		
		if(!empty($match['Game_1']['id'])) {
			if($match['Game_1']['winner'] == 'red') {
				$team_1_points += 2;
			} elseif($match['Game_1']['winner'] == 'green') {
				$team_2_points += 2;
			}
		}

		if(!empty($match['Game_2']['id'])) {
			if($match['Game_2']['winner'] == 'red') {
				$team_2_points += 2;
			} elseif($match['Game_2']['winner'] == 'green') {
				$team_1_points += 2;
			}
		}

		//both games are logged
		if(!empty($match['Game_1']['id']) && !empty($match['Game_2']['id'])) {
			if($team_1_points == $team_2_points) {
				//tie round, goes to score
				$team_1_total_score = $match['Game_1']['red_score'] + $match['Game_1']['red_adj'] + $match['Game_2']['green_score'] + $match['Game_2']['green_adj'];
				$team_2_total_score = $match['Game_1']['green_score'] + $match['Game_1']['green_adj'] + $match['Game_2']['red_score'] + $match['Game_2']['red_adj'];
				
				if($team_1_total_score > $team_2_total_score) {
					$team_1_points += 2;
				} elseif($team_1_total_score < $team_2_total_score) {
					$team_2_points += 2;
				} else {
					$team_1_points += 1;
					$team_2_points += 1;
				}
				
			} elseif($team_1_points > $team_2_points) {
				$team_1_points += 2;
			} else {
				$team_2_points += 2;
			}
		}
		
		$match['Match']['team_1_points'] = $team_1_points;
		$match['Match']['team_2_points'] = $team_2_points;
		$this->save($match);
	}
}