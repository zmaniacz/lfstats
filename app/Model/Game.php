<?php

class Game extends AppModel {
	public $hasMany = array(
		'Scorecard' => array(
			'className' => 'Scorecard',
			'foreignkey' => 'game_id'
		),
		'Red_Scorecard' => array(
			'className' => 'Scorecard',
			'foreignkey' => 'game_id',
			'conditions' => array('Red_Scorecard.team' => 'red')
		),
		'Green_Scorecard' => array(
			'className' => 'Scorecard',
			'foreignkey' => 'game_id',
			'conditions' => array('Green_Scorecard.team' => 'green')
		),
		'GameResult' => array(
			'className' => 'GameResult',
			'foreignKey' => 'game_id'
		),
		'TeamPenalties' => array(
			'className' => 'TeamPenalties',
			'foreignKey' => 'game_id'
		),
		'Red_TeamPenalties' => array(
			'className' => 'TeamPenalties',
			'foreignkey' => 'game_id',
			'conditions' => array('Red_TeamPenalties.team_color' => 'red')
		),
		'Green_TeamPenalties' => array(
			'className' => 'TeamPenalties',
			'foreignkey' => 'game_id',
			'conditions' => array('Green_TeamPenalties.team_color' => 'green')
		),
	);

	public $belongsTo = array(
		'Center' => array(
			'className' => 'Center',
			'foreignKey' => 'center_id'
		),
		'Red_Team' => array(
			'className' => 'EventTeam',
			'foreignKey' => 'red_team_id'
		),
		'Green_Team' => array(
			'className' => 'EventTeam',
			'foreignKey' => 'green_team_id'
		),
		'Match' => array(
			'className' => 'Match',
			'foreignKey' => 'match_id'
		),
		'Event' => array(
			'className' => 'Event',
			'foreignKey' => 'event_id'
		)
	);

	public $validate = array(
		'game_datetime' => array(
			'rule' => array('isUnique', array('game_datetime', 'center_id'), false),
			'message' => "Non-Unique center/game combination"
		)
	);
	
	public function getOverallStats($state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Game.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Game.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Game.event_id' => $state['leagueID']);
	
		$overall = $this->find('all', array(
			'fields' => array(
				'winner',
				'red_eliminated',
				'green_eliminated',
				'COUNT(game_datetime) as Total',
				'AVG(red_score) as red_avg_score',
				'AVG(green_score) as green_avg_score'
			),
			'conditions' => $conditions,
			'group' => array(
				'winner',
				'red_eliminated',
				'green_eliminated'
			)
		));

		return $overall;
	}

	public function getGameDetails($id) {
		$conditions[] = array('Game.id' => $id);

		$result = $this->find('first', array(
			'contain' => array(
				'Scorecard' => array(
					'Penalty',
                    'Hit'
				),
				'Match' => array(
					'Round'
				),
				'Red_Scorecard' => array(
					'fields' => array(
						'SUM(medic_hits) as medic_hits',
						'SUM(missile_hits) as missile_hits',
						'SUM(nukes_detonated) as nukes_detonated',
						'SUM(lives_left) as lives_left',
						'SUM(shots_left) as shots_left',
						'( SUM(shot_opponent) / SUM(times_zapped) ) as hit_diff',
						'SUM(resupplies) as resupplies',
						'SUM(bases_destroyed) as bases_destroyed',
						'AVG(accuracy) as accuracy',
						'SUM(mvp_points) as mvp_points'
					)
				),
				'Green_Scorecard' => array(
					'fields' => array(
						'SUM(medic_hits) as medic_hits',
						'SUM(missile_hits) as missile_hits',
						'SUM(nukes_detonated) as nukes_detonated',
						'SUM(lives_left) as lives_left',
						'SUM(shots_left) as shots_left',
						'( SUM(shot_opponent) / SUM(times_zapped) ) as hit_diff',
						'SUM(resupplies) as resupplies',
						'SUM(bases_destroyed) as bases_destroyed',
						'AVG(accuracy) as accuracy',
						'SUM(mvp_points) as mvp_points'
					)
				),
				'Red_TeamPenalties',
				'Green_TeamPenalties'
			),
			'conditions' => $conditions
		));

		return $result;
	}

	public function getMatchups($id) {
		$conditions[] = array('Game.id' => $id);

		$red_team = $this->find('first', array(
			'fields' => array('id'),
			'contain' => array(
				'Red_Scorecard' => array(
					'fields' => array(
						'player_id',
						'player_name',
						'position',
						'mvp_points'
					),
					'order' => 'position ASC, mvp_points DESC'
				)
			),
			'conditions' => $conditions
		));
		
		$green_team = $this->find('first', array(
			'fields' => array('id'),
			'contain' => array(
				'Green_Scorecard' => array(
					'fields' => array(
						'player_id',
						'player_name',
						'position',
						'mvp_points'
					),
					'order' => 'position ASC, mvp_points DESC'
				)
			),
			'conditions' => $conditions
		));

		$scout_counter = 1;
		foreach($red_team['Red_Scorecard'] as &$score) {
			if($score['position'] == 'Scout') {
				$score['position'] = 'Scout'.$scout_counter;
				$scout_counter++;
			}
		}

		$scout_counter = 1;
		foreach($green_team['Green_Scorecard'] as &$score) {
			if($score['position'] == 'Scout') {
				$score['position'] = 'Scout'.$scout_counter;
				$scout_counter++;
			}
		}
		$data = array();
		foreach($red_team['Red_Scorecard'] as $red_score) {
			foreach($green_team['Green_Scorecard'] as $green_score) {
				if($red_score['position'] == $green_score['position']) {
					$data[] = array(
						'position' => $red_score['position'],
						'red_player_id' => $red_score['player_id'],
						'red_player_name' => $red_score['player_name'],
						'green_player_id' => $green_score['player_id'],
						'green_player_name' => $green_score['player_name'],
						'matchup' => $this->Scorecard->getComparison($red_score['player_id'], $green_score['player_id'])
					);
				}
			}
		}
		return $data;
	}

	public function getGameList($date = null, $state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Game.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Game.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Game.event_id' => $state['leagueID']);
			
		if(!is_null($date))
			$conditions[] = array('DATE(Game.game_datetime)' => $date);

		$games = $this->find('all', array(
			'contain' => array(
				'Red_Team',
				'Green_Team',
				'Match' => array(
					'Round'
				)
			),
			'conditions' => $conditions,
			'order' => 'Game.game_datetime ASC'
		));
		return $games;
	}
	
	public function updateGameWinner($id) {
		$scores = $this->find('first', array(
			'fields' => array(
				'Game.id'
			),
			'contain' => array(
				'Scorecard' => array(
					'fields' => array(
						'score',
						'team_elim',
						'team'
					),
					'Penalty'
				),
				'Red_TeamPenalties',
				'Green_TeamPenalties'
			),
			'conditions' => array(
				'Game.id' => $id
			)
			
		));

		if(count($scores['Scorecard']) < 1) {
			//This is a manually edited game with no scorecards and we're going to skip it
			return;
		}
		
		$elim_bonus = 10000;
		$red_raw = 0;
		$red_bonus = 0;
		$red_pens = 0;
		$red_team_pens = 0;
		$red_elim = 0;
		$green_raw = 0;
		$green_bonus = 0;
		$green_pens = 0;
		$green_team_pens = 0;
		$green_elim = 0;
		$winner = 'green';

		foreach($scores['Scorecard'] as $scorecard) {
			if($scorecard['team'] == 'red') {
				$red_raw += $scorecard['score'];
				$red_elim += $scorecard['team_elim'];
			} else {
				$green_raw += $scorecard['score'];
				$green_elim += $scorecard['team_elim'];
			}

			if(!empty($scorecard['Penalty'])) {
				foreach($scorecard['Penalty'] as $penalty) {
					if($scorecard['team'] == 'red') {
						$red_pens += $penalty['value'];
					} else {
						$green_pens += $penalty['value'];
					}
				}
			}
		}

		
		//Apply the elim bonus if the opposing team was eliminated...both teams can get the bonus
		if($red_elim > 0) {
			$green_bonus += $elim_bonus;
			$red_elim = 1;
		}
		
		if($green_elim > 0) {
			$red_bonus += $elim_bonus;
			$green_elim = 1;
		}

		//load team penalties in
		foreach($scores['Red_TeamPenalties'] as $team_penalty) {
			$red_team_pens += $team_penalty['value'];
		}

		foreach($scores['Green_TeamPenalties'] as $team_penalty) {
			$green_team_pens += $team_penalty['value'];
		}
		
		//calc the scores and assign the winner
		if($red_raw + $red_bonus + $red_pens + $red_team_pens > $green_raw + $green_bonus + $green_pens + $green_team_pens) {
			$winner = 'red';
		} else {
			$winner = 'green';
		}

		//force an elim to equal a win
		if($red_elim > 0) {
			$winner = 'green';
		}
		
		if($green_elim > 0) {
			$winner = 'red';
		}
			
		$data = array('id' => $id,
			'green_score' => $green_raw,
			'red_score' => $red_raw,
			'red_adj' => $red_bonus + $red_pens + $red_team_pens,
			'green_adj' => $green_bonus + $green_pens + $green_team_pens,
			'red_eliminated' => $red_elim,
			'green_eliminated' => $green_elim,
			'winner' => $winner
		);
		
		$this->save($data);

		$game = $this->find('first', array(
			'contain' => array(
				'Match'
			),
			'conditions' => array(
				'Game.id' => $id
			)
		));
		
		if(isset($scores['Match']['id'])) {
			$this->Match->updatePoints($scores['Match']['id']);
		}
	}

	public function getPrevNextGame($game_id) {
		$game = $this->findById($game_id);

		if($game['Game']['type'] == 'league' || $game['Game']['type'] == 'tournament') {
			App::import('Model', 'LeagueGame');
			$leagueGame = new LeagueGame();
			$results = $leagueGame->find('neighbors', array(
				'field' => 'game_id',
				'value' => $game_id,
				'conditions' => array(
					'event_id' => $game['Game']['event_id']
				)
			));

			$results = array_map(function($position) {
				if(isset($position['LeagueGame']))
					return array(
						'Game' => $position['LeagueGame']
					);
			}, $results);
		} else {
			$results = $this->find('neighbors', array(
				'field' => 'id',
				'value' => $game_id,
				'order' => 'game_datetime DESC'
			));

			$results = array_map(function($position) {
				if(isset($position['Game'])) {
					$position['Game']['game_id'] = $position['Game']['id'];
					return $position;
				}
			}, $results);
		}

		return $results;
	}

	public function getDatabaseStats() {
		$stats = $this->find('first', array(
			'fields' => array(
				'COUNT(id) as total_games'
			)
		));

		return $stats;
	}

	public function fixSocialGameNames($date, $center_id) {
		//christ
		$games = $this->find('all', array(
			'conditions' => array(
				'center_id' => $center_id,
				'DATE(game_datetime)' => $date
			),
			'order' => 'game_datetime ASC'
		));

		$game_counter=1;
		foreach($games as $game) {
			$game['Game']['game_name'] = "G{$game_counter}";
			$this->save($game);
			$game_counter++;
		}
	}
}