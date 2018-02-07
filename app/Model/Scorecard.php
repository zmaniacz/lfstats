<?php

class Scorecard extends AppModel {
	public $belongsTo = array(
		'Player' => array(
			'className' => 'Player',
			'foreignKey' => 'player_id'
		),
		'Game' => array(
			'className' => 'Game',
			'foreignKey' => 'game_id'
		)
	);

	public $hasOne = array(
		'GameResult' => array(
			'className' => 'GameResult',
			'foreignKey' => 'scorecard_id'
		)
	);

	public $hasMany = array(
		'Penalty' => array(
			'className' => 'Penalty',
			'foreignkey' => 'scorecard_id'
		),
        'Hit' => array(
			'className' => 'Hit',
			'foreignkey' => 'scorecard_id'
		)
	);

	public $validate = array(
		'player_name' => array(
			'on' => 'create',
			'rule' => array('uniqueScorecard'),
			'message' => "Non-Unique player/game combination"
		)
	);

	public function uniqueScorecard ($player_name) {
		$count = $this->find('count', array(
			'conditions' => array(
				'player_name' => $player_name, 
				'game_datetime' => $this->data[$this->alias]['game_datetime']
			)
		));
		return $count == 0;
	}
	
	public function generateMVP() {
		$counter = 0;
		$scores = $this->find('all', array('conditions' => array('Scorecard.mvp_points' => NULL), 'limit' => 1000));
		foreach ($scores as $score) {
			$mvp = 0;

			//Position based point bonus
			switch($score['Scorecard']['position']) {
				case "Ammo Carrier":
					$mvp += max(ceil(($score['Scorecard']['score']-3999)/1000),0);
					break;
				case "Commander":
					$mvp += max(ceil(($score['Scorecard']['score']-10999)/1000),0);
					break;
				case "Heavy Weapons":
					$mvp += max(ceil(($score['Scorecard']['score']-7999)/1000),0);
					break;
				case "Medic":
					$mvp += max(ceil(($score['Scorecard']['score']-2999)/1000),0);
					break;
				case "Scout":
					$mvp += max(ceil(($score['Scorecard']['score']-6999)/1000),0);
					break;
			}

			//medic bonus point
			if($score['Scorecard']['position'] == 'Medic' && $score['Scorecard']['score'] >= 3000) {
				$mvp += 1;
			}
			
			//accuracy bonus
			$mvp += round($score['Scorecard']['accuracy'] * 10,1);
			
			//don't get missiled dummy
			$mvp += $score['Scorecard']['times_missiled'] * -1;
			
			//missile other people instead
			switch($score['Scorecard']['position']) {
				case "Commander":
					$mvp += $score['Scorecard']['missiled_opponent'];
					break;
				case "Heavy Weapons":
					$mvp += $score['Scorecard']['missiled_opponent'] * 2;
					break;
			}
			
			//get dat 5-chain
			$mvp += $score['Scorecard']['nukes_detonated'];
			
			//maybe hide better
			if($score['Scorecard']['nukes_activated'] - $score['Scorecard']['nukes_detonated'] > 0) {
				$conditions = array();
				
				$conditions[] = array('game_id' => $score['Scorecard']['game_id']);
				
				if($score['Scorecard']['team'] == 'red')
					$conditions[] = array('team' => 'green');
				else
					$conditions[] = array('team' => 'red');
				
				$nukes = $this->find('all',
					array(
						'fields' => array(
							'SUM(nukes_canceled) AS all_nukes_canceled'
						),
						'conditions' => $conditions
					)
				);
				
				if($nukes[0][0]['all_nukes_canceled'] > 0)
					$mvp += (int)$nukes[0][0]['all_nukes_canceled'] * -3;
			}
			
			//make commanders cry
			$mvp += $score['Scorecard']['nukes_canceled'] *3;
			
			//medic tears are scrumptious
			$mvp += $score['Scorecard']['medic_hits'];
			
			//dont be a venom
			$mvp += $score['Scorecard']['own_medic_hits'] * -1;
			
			//push the little button
			$mvp += $score['Scorecard']['scout_rapid'] * .5;
			$mvp += $score['Scorecard']['life_boost'] * 2;
			$mvp += $score['Scorecard']['ammo_boost'] * 3;
			
			//survival bonuses/penalties
			if($score['Scorecard']['lives_left'] > 0 && $score['Scorecard']['position'] == "Medic")
				$mvp += 2;
			
			if($score['Scorecard']['lives_left'] <= 0 && $score['Scorecard']['position'] != "Medic")
				$mvp += -1;
			
			//lose 5 points for every penalty in competitive games only
			if($score['Scorecard']['type'] == 'league' || $score['Scorecard']['type'] == 'tournament') {
				$penalties = $this->Penalty->find('all', array(
					'conditions' => array(
						'scorecard_id' => $score['Scorecard']['id']
					)
				));
				
				foreach($penalties as $penalty) {
					if($penalty['Penalty']['type'] != 'Penalty Removed')
						$mvp += $penalty['Penalty']['mvp_value'];
				}
			}
			
			//raping 3hits.  the math looks weird, but it works and gets the desired result
			$mvp += floor(($score['Scorecard']['shot_3hit']/6)*100) / 100;
			
			//No.  Stahp.
			$mvp += $score['Scorecard']['own_nuke_cancels'] * -3;
			
			//more venom points
			$mvp += $score['Scorecard']['missiled_team'] * -3;
			
			//WINNER
			$mvp += $score['Scorecard']['elim_other_team'] * 2;
			
			$score['Scorecard']['mvp_points'] = max($mvp,0);

			if($this->save($score)) {
				$counter++;
			} else {
				debug($this->validationErrors); die();
			}
		}
		return $counter;
	}
	
	public function generateGames() {
	
		App::uses('Sanitize', 'Utility');
		$counter = 0;
		
		$scores = $this->query("SELECT green.game_datetime, green.type, green.score, red.score, green.team_elim, red.team_elim, green.pdf_id, green.event_id, green.center_id
			FROM (
				SELECT game_datetime, type, pdf_id, event_id, center_id, SUM(score) AS score, SUM(team_elim) AS team_elim
				FROM scorecards 
				WHERE team = 'green' AND game_id IS NULL
				GROUP BY game_datetime
			) AS green,
			(
				SELECT game_datetime, SUM(score) AS score, SUM(team_elim) AS team_elim
				FROM scorecards
				WHERE team = 'red' AND game_id IS NULL
				GROUP BY game_datetime
			) AS red
			WHERE green.game_datetime = red.game_datetime 
			ORDER BY green.game_datetime"
		);
		
		$current_date = 0;
		$date = 0;
		$game_counter = 0;
		
		foreach($scores as $score) {
			$date = date("Y-m-d", strtotime($score['green']['game_datetime']));
			if($current_date == $date) {
				$game_counter++;
			} else {
				$game_counter = 1;
				$current_date = $date;
			}

			$this->Game->create();
			$this->Game->set(array(
				'game_name' => "G{$game_counter}",
				'game_description' => "",
				'game_datetime' => $score['green']['game_datetime'],
				'type' => $score['green']['type'],
				'pdf_id' => $score['green']['pdf_id'],
				'event_id' => $score['green']['event_id'],
				'center_id' => $score['green']['center_id']
			));
			$this->Game->save();
			
			$this->updateAll(
				array('Scorecard.game_id' =>  '"' . $this->Game->id . '"'),
				array('Scorecard.game_datetime' => $score['green']['game_datetime'])
			);

			$this->Game->updateGameWinner($this->Game->id);
			
			$counter++;
		}
		return $counter;
	}
	
	public function generatePlayers() {
		$scores = $this->find('all', array('conditions' => array('Scorecard.player_id' => NULL)));
		$players = $this->Player->PlayersName->find('all');
		$results = array('new' => 0, 'existing' => 0);

		foreach($scores as $score) {
			$found = false;
			foreach($players as $key => $val) {
				if(strcasecmp($score['Scorecard']['player_name'], $val['PlayersName']['player_name']) == 0 ) {
					$score['Scorecard']['player_id'] = $val['PlayersName']['player_id'];
					$this->save($score);
					$results['existing']++;
					$found = true;
					break;
				}
			}
				
			if(!$found) {
				$this->Player->Create();
				$this->Player->set(array(
					'player_name' => $score['Scorecard']['player_name']
				));
				$this->Player->save();
				
				$score['Scorecard']['player_id'] = $this->Player->id;
				$this->save($score);
				
				$this->Player->PlayersName->Create();
				$this->Player->PlayersName->set(array(
					'player_id' => $this->Player->id,
					'player_name' => $score['Scorecard']['player_name']
				));
				$this->Player->PlayersName->save();

				$results['new']++;
				
				$players = $this->Player->PlayersName->find('all');
			}
		}
		
		return $results;
	}
    
    public function generatePlayer($player_name) {
		$player = $this->Player->PlayersName->findByPlayerName($player_name);
        
        if(empty($player)) {
            $this->Player->Create();
            $this->Player->set(array(
                'player_name' => $player_name
            ));
            $this->Player->save();
            
            $this->Player->PlayersName->Create();
            $this->Player->PlayersName->set(array(
                'player_id' => $this->Player->id,
                'player_name' => $player_name
            ));
            $this->Player->PlayersName->save();
		
            return $this->Player->id;
        } else {
            return $player['PlayersName']['player_id'];
        }
	}
	
	public function getGameDates($state) {
		$conditions[] = array();
			
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('event_id' => $state['leagueID']);

		$game_dates = $this->find('all', array(
			'fields' => array('DISTINCT DATE(Scorecard.game_datetime) as game_date'),
			'order' => 'game_date DESC',
			'conditions' => $conditions
		));
		$game_dates = Set::combine($game_dates, '{n}.0.game_date', '{n}.0.game_date');
		return $game_dates;
	}

	public function getScorecardsByDate($date, $state) {
		$conditions = array();
		
		if(!is_null($date))
			$conditions[] = array('DATE(Scorecard.game_datetime)' => $date);
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);
	
		$scorecards = $this->find('all', array(
			'conditions' => $conditions,
			'contain' => array(
				'Game' => array()
			)
		));
		
		return $scorecards;
	}

	public function getNightlyStatsByDate($date, $state) {
		$conditions = array();
		
		if(!is_null($date))
			$conditions[] = array('DATE(Scorecard.game_datetime)' => $date);
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);

		$stats = $this->find('all', array(
			'fields' => array(
				'player_id',
				'MIN(Scorecard.score) as min_score',
				'ROUND(AVG(Scorecard.score)) as avg_score',
				'MAX(Scorecard.score) as max_score',
				'MIN(Scorecard.mvp_points) as min_mvp',
				'AVG(Scorecard.mvp_points) as avg_mvp',
				'MAX(Scorecard.mvp_points) as max_mvp',	
				'AVG(Scorecard.accuracy) as avg_acc',
				'(SUM(Scorecard.shot_opponent)/SUM(Scorecard.times_zapped)) as hit_diff',
				'SUM(Scorecard.medic_hits) as medic_hits',
				'(SUM(Scorecard.team_elim)/COUNT(Scorecard.game_datetime)) as elim_rate',
				'COUNT(Scorecard.game_datetime) as games_played',
				'SUM(GameResult.won) as games_won'
			),
			'contain' => array(
				'Player' => array(
					'fields' => array('id', 'player_name')
				)
			),
			'joins' => array(
				array(
					'table' => 'game_results',
					'alias' => 'GameResult',
					'type' => 'LEFT',
					'conditions' => array(
						'GameResult.scorecard_id = Scorecard.id'
					)
				)
			),
			'conditions' => $conditions,
			'group' => "Scorecard.player_id",
			'order' => 'avg_mvp DESC'
		));

		return $stats;
	}

	public function getComparableMVP($player_id) {
		$results = $this->find('all', array(
			'fields' => array(
				'player_id',
				'position',
				'AVG(mvp_points) as avg_mvp'
			),
			'conditions' => array(
				'player_id' => $player_id
			),
			'group' => 'player_id, position',
			'order' => 'position ASC'
		));

		$data = array();
		foreach($results as $result) {
			$data[] = (float) $result[0]['avg_mvp'];
		}
		
		return $data;
	}

	public function getComparison($player1_id, $player2_id) {
		App::import('Vendor','CosineSimilarity',array('file' => 'CosineSimilarity/CosineSimilarity.php'));
		$compare = new CosineSimilarity();

		$player1_stats = $this->getComparableMVP($player1_id);
		$player2_stats = $this->getComparableMVP($player2_id);

		$max = max(max($player1_stats), max($player2_stats));
		$min = min(min($player1_stats), min($player2_stats));

		foreach($player1_stats as &$stat) {
			$stat = ($stat - $min) / ($max - $min);
		}

		foreach($player2_stats as &$stat) {
			$stat = ($stat - $min) / ($max - $min);
		}

		$distance = $compare->similarity($player1_stats, $player2_stats);

		return $distance;
	}
	
	public function getPositionStats($role = null, $state = null) {
		$conditions = array();
		$min_games = null;

		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);

		if(!is_null($role))
			$conditions[] = array('Scorecard.position' => $role);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all') {
			$conditions[] = array('Scorecard.type' => $state['gametype']);
			
			if($state['gametype'] == 'league') {
				if(isset($state['show_subs']) && $state['show_subs'] == 'true')
					$conditions[] = array('Scorecard.is_sub >=' => 0);
				else
					$conditions[] = array('Scorecard.is_sub' => 0);
					
				if(isset($state['show_finals']) && $state['show_finals'] == 'true' && isset($state['show_rounds']) && $state['show_rounds'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (SELECT game_id FROM league_games WHERE event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;					
				} elseif(isset($state['show_finals']) && $state['show_finals'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (SELECT game_id FROM league_games WHERE is_finals = 1 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				} elseif(isset($state['show_rounds']) && $state['show_rounds'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				} else {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (0)";
       		 		$conditions[] = $subQuery;
				}
			}
		}
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);
		
		$scores = $this->find('all', array(
			'fields' => array(
				'player_id',
				'MIN(Scorecard.score) as min_score',
				'ROUND(AVG(Scorecard.score)) as avg_score',
				'MAX(Scorecard.score) as max_score',
				'SUM(Scorecard.score) as total_score',
				'AVG(Scorecard.mvp_points) as avg_mvp',
				'SUM(Scorecard.mvp_points) as total_mvp',
				'COUNT(Scorecard.game_datetime) as games_played',
				'MIN(Scorecard.accuracy) as min_acc',
				'AVG(Scorecard.accuracy) as avg_acc',
				'MAX(Scorecard.accuracy) as max_acc',
				'(SUM(Scorecard.nukes_detonated)/SUM(Scorecard.nukes_activated)) as nuke_ratio',
				'(SUM(Scorecard.shot_opponent)/SUM(Scorecard.times_zapped)) as hit_diff',
				'AVG(Scorecard.missiled_opponent) as avg_missiles',
				'AVG(Scorecard.medic_hits) as avg_medic_hits',
				'AVG(Scorecard.shot_3hit) as avg_3hit',
				'AVG(Scorecard.ammo_boost) as avg_ammo_boost',
				'AVG(Scorecard.life_boost) as avg_life_boost',
				'AVG(Scorecard.resupplies) as avg_resup',
				'AVG(Scorecard.lives_left) as avg_lives',
				'(SUM(Scorecard.team_elim)/COUNT(Scorecard.game_datetime)) as elim_rate',
				'SUM(GameResult.won) as games_won'
			),
			'contain' => array(
				'Player' => array(
					'fields' => array('id', 'player_name')
				)
			),
			'joins' => array(
				array(
					'table' => 'game_results',
					'alias' => 'GameResult',
					'type' => 'LEFT',
					'conditions' => array(
						'GameResult.scorecard_id = Scorecard.id'
					)
				)
			),
			'conditions' => $conditions,
			'group' => "Scorecard.player_id".(($min_games > 0) ? " HAVING Scorecard.games_played >= $min_games" : ""),
			'order' => 'avg_mvp DESC'
		));
		
		return $scores;
	}
	
	public function getAllAvgMVP($state = null) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all') {
			$conditions[] = array('Scorecard.type' => $state['gametype']);
			
			if($state['gametype'] == 'league') {
				if(isset($state['show_subs']) && $state['show_subs'] == 'true')
					$conditions[] = array('Scorecard.is_sub >=' => 0);
				else
					$conditions[] = array('Scorecard.is_sub' => 0);
					
				if(isset($state['show_finals']) && $state['show_finals'] == 'true' && isset($state['show_rounds']) && $state['show_rounds'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (SELECT game_id FROM league_games WHERE event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;					
				} elseif(isset($state['show_finals']) && $state['show_finals'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (SELECT game_id FROM league_games WHERE is_finals = 1 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				} elseif(isset($state['show_rounds']) && $state['show_rounds'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				} else {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "Scorecard.game_id IN (0)";
       		 		$conditions[] = $subQuery;
				}
			}
		}
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);

		$players_position = $this->find('all', array(
			'fields' => array(
				'Scorecard.player_id',
				'Scorecard.position',
				'AVG(Scorecard.mvp_points) as avg_mvp',
				'AVG(Scorecard.accuracy) as avg_acc',
				'COUNT(Scorecard.game_datetime) as games_played',
				'SUM(GameResult.won) as games_won'
			),
			'joins' => array(
				array(
					'table' => 'game_results',
					'alias' => 'GameResult',
					'type' => 'LEFT',
					'conditions' => array(
						'GameResult.scorecard_id = Scorecard.id'
					)
				)
			),
			'conditions' => $conditions,
			'group' => 'player_id, position'
		));
		
		$players_overall = $this->find('all', array(
			'fields' => array(
				'Scorecard.player_id',
				'AVG(Scorecard.mvp_points) as avg_mvp',
				'SUM(Scorecard.mvp_points) as total_mvp',
				'AVG(Scorecard.accuracy) as avg_acc',
				'COUNT(Scorecard.game_datetime) as games_played',
				'SUM(GameResult.won) as games_won' 
			),
			'joins' => array(
				array(
					'table' => 'game_results',
					'alias' => 'GameResult',
					'type' => 'LEFT',
					'conditions' => array(
						'GameResult.scorecard_id = Scorecard.id'
					)
				)
			),
			'conditions' => $conditions,
			'group' => 'player_id'
		));
		
		$players = $this->Player->find('list');
		
		$results = array();
		foreach($players_overall as $player) {
			if(!isset($results[$player['Scorecard']['player_id']])) {
				$results[$player['Scorecard']['player_id']] = array();
				$results[$player['Scorecard']['player_id']]['player_name'] = $players[$player['Scorecard']['player_id']];
			}
			
			$results[$player['Scorecard']['player_id']]['avg_avg_mvp'] = $player[0]['avg_mvp'];
			$results[$player['Scorecard']['player_id']]['total_mvp'] = $player[0]['total_mvp'];
			$results[$player['Scorecard']['player_id']]['avg_avg_acc'] = $player[0]['avg_acc'];
			$results[$player['Scorecard']['player_id']]['total_games_won'] = $player[0]['games_won'];
			$results[$player['Scorecard']['player_id']]['total_games'] = $player[0]['games_played'];
			$results[$player['Scorecard']['player_id']]['Commander']['avg_mvp'] = 0;
			$results[$player['Scorecard']['player_id']]['Commander']['avg_acc'] = 0;
			$results[$player['Scorecard']['player_id']]['Commander']['games_won'] = 0;
			$results[$player['Scorecard']['player_id']]['Commander']['games_played'] = 0;
			$results[$player['Scorecard']['player_id']]['Heavy Weapons']['avg_mvp'] = 0;
			$results[$player['Scorecard']['player_id']]['Heavy Weapons']['avg_acc'] = 0;
			$results[$player['Scorecard']['player_id']]['Heavy Weapons']['games_won'] = 0;
			$results[$player['Scorecard']['player_id']]['Heavy Weapons']['games_played'] = 0;
			$results[$player['Scorecard']['player_id']]['Scout']['avg_mvp'] = 0;
			$results[$player['Scorecard']['player_id']]['Scout']['avg_acc'] = 0;
			$results[$player['Scorecard']['player_id']]['Scout']['games_won'] = 0;
			$results[$player['Scorecard']['player_id']]['Scout']['games_played'] = 0;
			$results[$player['Scorecard']['player_id']]['Ammo Carrier']['avg_mvp'] = 0;
			$results[$player['Scorecard']['player_id']]['Ammo Carrier']['avg_acc'] = 0;
			$results[$player['Scorecard']['player_id']]['Ammo Carrier']['games_won'] = 0;
			$results[$player['Scorecard']['player_id']]['Ammo Carrier']['games_played'] = 0;
			$results[$player['Scorecard']['player_id']]['Medic']['avg_mvp'] = 0;
			$results[$player['Scorecard']['player_id']]['Medic']['avg_acc'] = 0;
			$results[$player['Scorecard']['player_id']]['Medic']['games_won'] = 0;
			$results[$player['Scorecard']['player_id']]['Medic']['games_played'] = 0;
		}
		
		foreach($players_position as $player) {
			$results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['avg_mvp'] = $player[0]['avg_mvp'];
			$results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['avg_acc'] = $player[0]['avg_acc'];
			$results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['games_won'] = $player[0]['games_won'];
			$results[$player['Scorecard']['player_id']][$player['Scorecard']['position']]['games_played'] = $player[0]['games_played'];
		}
		
		return $results;
	}
	
	public function getMedicHitStats($state = null) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all') {
			$conditions[] = array('type' => $state['gametype']);
			
			if($state['gametype'] == 'league') {
				if(isset($state['show_subs']) && $state['show_subs'] == 'true')
					$conditions[] = array('is_sub >=' => 0);
				else
					$conditions[] = array('is_sub' => 0);

				if(isset($state['show_finals']) && $state['show_finals'] == 'true' && isset($state['show_rounds']) && $state['show_rounds'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;					
				} elseif(isset($state['show_finals']) && $state['show_finals'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 1 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				} elseif(isset($state['show_rounds']) && $state['show_rounds'] == 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				} else {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (0)";
       		 		$conditions[] = $subQuery;
				}
			}
		}
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('event_id' => $state['leagueID']);
			
		$subQueryConditions = $conditions;

		$subQueryConditions[] = array('position NOT IN ("Medic", "Ammo Carrier")');

		$non_resup_scores = $this->find('all', array(
			'fields' => array(
				'player_id',
				'SUM(Scorecard.medic_hits) as total_medic_hits',
				'(SUM(Scorecard.medic_hits)/COUNT(Scorecard.game_datetime)) as medic_hits_per_game',
				'COUNT(Scorecard.game_datetime) as games_played'
			),
			'conditions' => $subQueryConditions,
			'group' => 'player_id HAVING total_medic_hits > 0',
			'order' => 'player_id DESC'
		));

		$scores = $this->find('all', array(
			'fields' => array(
				'player_id',
				'SUM(Scorecard.medic_hits) as total_medic_hits',
				'(SUM(Scorecard.medic_hits)/COUNT(Scorecard.game_datetime)) as medic_hits_per_game',
				'COUNT(Scorecard.game_datetime) as games_played'
			),
			'contain' => array(
				'Player' => array(
					'fields' => array(
						'id',
						'player_name'
					)
				)
			),
			'conditions' => $conditions,
			'group' => 'player_id HAVING total_medic_hits > 0',
			'order' => 'player_id DESC'
		));

		foreach($scores as &$score) {
			foreach($non_resup_scores as $non_resup_score) {
					$score[0]['non_resup_total_medic_hits'] = 0;
					$score[0]['non_resup_medic_hits_per_game'] = 0;
					$score[0]['non_resup_games_played'] = 0;
				if($score['Scorecard']['player_id'] == $non_resup_score['Scorecard']['player_id']) {
					$score[0]['non_resup_total_medic_hits'] = $non_resup_score[0]['total_medic_hits'];
					$score[0]['non_resup_medic_hits_per_game'] = $non_resup_score[0]['medic_hits_per_game'];
					$score[0]['non_resup_games_played'] = $non_resup_score[0]['games_played'];
					break;
				}
			}
		}
		return $scores;
	}

	public function getMedicHitStatsByDate($date, $state) {
		$conditions = array();
		
		if(!is_null($date))
			$conditions[] = array('DATE(game_datetime)' => $date);	
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('event_id' => $state['leagueID']);

		$subQueryConditions = $conditions;

		$subQueryConditions[] = array('position NOT IN ("Medic", "Ammo Carrier")');

		$db = $this->getDataSource();
		$subQuery = $db->buildStatement(
			array(
				'fields' => array(
					'ScorecardNoResup.player_id',
					'SUM(ScorecardNoResup.medic_hits) as total_medic_hits',
					'(SUM(ScorecardNoResup.medic_hits)/COUNT(ScorecardNoResup.game_datetime)) as medic_hits_per_game',
					'COUNT(ScorecardNoResup.game_datetime) as games_played'
				),
				'table' => $db->fullTableName($this),
				'alias' => 'ScorecardNoResup',
				'conditions' => $subQueryConditions,
				'group' => 'ScorecardNoResup.player_id',
			),
			$this
		);

		$subQuery = '('.$subQuery.')';
	
		$scores = $this->find('all', array(
			'joins' => array(
				array(
					'alias' => 'ScorecardNoResup',
					'table' => $subQuery,
					'conditions' =>array(
						'Scorecard.player_id = ScorecardNoResup.player_id'
					)
				)
			),
			'fields' => array(
				'player_name',
				'player_id',
				'SUM(Scorecard.medic_hits) as total_medic_hits',
				'(SUM(Scorecard.medic_hits)/COUNT(Scorecard.game_datetime)) as medic_hits_per_game',
				'COUNT(Scorecard.game_datetime) as games_played',
				'ScorecardNoResup.total_medic_hits',
				'ScorecardNoResup.medic_hits_per_game',
				'ScorecardNoResup.games_played',
			),
			'conditions' => $conditions,
			'group' => 'player_id, player_name',
			'order' => 'total_medic_hits DESC'
		));
		return $scores;
	}

	public function getMedicHitStatsByRound($round, $league_id) {
		//need to do round shit here
		$conditions = array();
			
		$conditions[] = array('Scorecard.event_id' => $league_id);
	
		$scores = $this->find('all', array(
			'fields' => array(
				'player_name',
				'player_id',
				'SUM(Scorecard.medic_hits) as total_medic_hits',
				'(SUM(Scorecard.medic_hits)/COUNT(Scorecard.game_datetime)) as medic_hits_per_game'
			),
			'conditions' => $conditions,
			'group' => 'player_name',
			'order' => 'total_medic_hits DESC'
		));
		return $scores;
	}
	
	public function getPlayerGamesScorecardsById($player_id, $state = null) {
		$conditions = array();
		
		$conditions['player_id'] = $player_id;
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);

		$scorecards = $this->find('all', array(
			'conditions' => $conditions,
			'order' => 'Scorecard.game_datetime DESC',
			'contain' => array('Game' => array(
				'Red_Team', 
				'Green_Team', 
				'Match' =>array(
					'Round'
				)
			))
		));
		
		return $scorecards;
	}
	
	public function getPlayerTopScorecardsMVPById($player_id, $position = "") {
		$conditions = array('player_id' => $player_id);
		if($position != "" ) {
			$conditions['position'] = $position;
		}
	
		$games = $this->find('all', array(
			'conditions' => $conditions,
			'order' => 'Scorecard.mvp_points DESC',
			'limit' => 5,
			'contain' => array(
				'Game' => array()
			)
		));
		
		return $games;
	}

	public function getPlayerTopScorecardsScoreById($player_id, $position = "") {
		$conditions = array('player_id' => $player_id);
		if($position != "" ) {
			$conditions['position'] = $position;
		}
	
		$games = $this->find('all', array(
			'conditions' => $conditions,
			'order' => 'Scorecard.score DESC',
			'limit' => 5,
			'contain' => array(
				'Game' => array()
			)
		));
		
		return $games;
	}

	public function getOverallAverages($state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);
		
		$overall = $this->find('all', array(
			'fields' => array(
				'position',
				'AVG(score) as avg_score',
				'AVG(mvp_points) as avg_mvp'
			),
			'conditions' => $conditions,
			'group' => array(
				'position'
			)
		));

		return $overall;
	}
    
    public function getHitDetails($player_id, $game_id) {
        $hits = $this->find('all', array(
            'fields' => array(
                'id',
                'player_name',
                'team',
                'position',
                'rank',
                'player_id',
                'game_id'
            ),
            'contain' => array(
                'Hit' => array(
                    'conditions' => array(
                        "OR" =>array(
                            'player_id' => $player_id,
                            'target_id' => $player_id
                        )
                    ),
                    'Player',
                    'Target'
                )
            ),
            'conditions' => array(
                'game_id' => $game_id
            )
        ));
        
        $results = array();
        
        foreach($hits as $hit) {
            foreach($hit['Hit'] as $record) {
                if($record['Player']['id'] == $player_id) {
                    $results[$record['Target']['id']]['hit'] = $record['hits'];
                    $results[$record['Target']['id']]['missile'] = $record['missiles'];
                } else {
                    $results[$record['Player']['id']]['id'] = $record['Player']['id'];
                    $results[$record['Player']['id']]['name'] = $record['Player']['player_name'];
                    $results[$record['Player']['id']]['position'] = $hit['Scorecard']['position'];
                    $results[$record['Player']['id']]['rank'] = $hit['Scorecard']['rank'];
                    $results[$record['Player']['id']]['team'] = $hit['Scorecard']['team'];
                    $results[$record['Player']['id']]['hitBy'] = $record['hits'];
                    $results[$record['Player']['id']]['missileBy'] = $record['missiles'];
                }
            }
            
            if($hit['Scorecard']['player_id'] == $player_id) {
                $results[$player_id]['id'] = $hit['Scorecard']['player_id'];
                $results[$player_id]['name'] = $hit['Scorecard']['player_name'];
                $results[$player_id]['position'] = $hit['Scorecard']['position'];
                $results[$player_id]['team'] = $hit['Scorecard']['team'];
                $results[$player_id]['rank'] = $hit['Scorecard']['rank'];
            }
        }

        foreach ($results as $key => $row) {
            $team[$key] = $row['team'];
            $rank[$key] = $row['rank'];
        }
		array_multisort($team, SORT_ASC, $rank, SORT_ASC, $results);
        
        return $results;
    }

	public function getPlayerHitDetails($player_id, $state) {
		$conditions = array();

		$conditions[] = array('Scorecard.player_id' => $player_id);
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('Scorecard.event_id' => $state['leagueID']);

        $scorecards = $this->find('list', array(
			'fields' => array('game_id'),
            'conditions' => $conditions
        ));
		

		$games_ids = implode(",",$scorecards);

		$db = $this->getDataSource();
		$results = $db->fetchAll("
			SELECT 
				player_hits.player_id,
				player_hits.target_id,
				SUM(player_hits.hits) AS hits,
				SUM(player_hits.missiles) AS missiles,
				targets.hit_by,
				targets.missile_by
			FROM
				(SELECT 
					hits.*, scorecards.game_id
				FROM
					hits
				LEFT JOIN scorecards ON hits.scorecard_id = scorecards.id) AS player_hits
					LEFT JOIN
				(SELECT 
					player_hits.player_id,
						SUM(player_hits.hits) AS hit_by,
						SUM(player_hits.missiles) AS missile_by
				FROM
					(SELECT 
					hits.*, scorecards.game_id
				FROM
					hits
				LEFT JOIN scorecards ON hits.scorecard_id = scorecards.id) AS player_hits
				WHERE
					player_hits.target_id = $player_id AND player_hits.game_id IN ($games_ids)
				GROUP BY player_hits.player_id) AS targets ON player_hits.target_id = targets.player_id
			WHERE
				player_hits.player_id = $player_id
					AND player_hits.game_id IN ($games_ids)
			GROUP BY player_hits.player_id , player_hits.target_id");
        
		$hits = array();
		foreach($results as $result) {
			$hits[] = array(
				'opponent_id' => $result['player_hits']['target_id'],
				'hits' => $result[0]['hits'],
				'missiles' => $result[0]['missiles'],
				'hit_by' => $result['targets']['hit_by'],
				'missile_by' => $result['targets']['missile_by'],
			);
		}

        return $hits;
    }

	public function getLeaderboards($state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('type' => $state['gametype']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all') {
			$conditions[] = array('type' => $state['gametype']);
			
			if($state['gametype'] == 'league') {
				if(isset($state['show_subs']) && $state['show_subs'] == 'true')
					$conditions[] = array('is_sub >=' => 0);
				else
					$conditions[] = array('is_sub' => 0);
					
				if(!isset($state['show_finals']) || $state['show_finals'] != 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				}
			}
		}
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('event_id' => $state['leagueID']);


		$leaderboards = $this->find('all', array(
			'contain' => array(
				'Player' => array(
					'fields' => array(
						'player_name'
					)
				)
			),
			'fields' => array(
				'player_id',
				'COUNT(game_datetime) as games_played',
				'SUM(times_missiled) as times_missiled_total',
				'SUM(nukes_detonated) as nukes_detonated_total',
				'SUM(nukes_canceled) as nukes_canceled_total',
				'SUM(medic_hits) as medic_hits_total',
				'SUM(own_medic_hits) as own_medic_hits_total',
				'SUM(score) as score_total',
				'SUM(elim_other_team) as elim_other_team_total',
				'SUM(team_elim) as team_elim_total',
				'SUM(own_nuke_cancels) as own_nuke_cancels_total',
				'SUM(missiled_opponent) as missiled_opponent_total',
				'SUM(missiled_team) as missiled_team_total',
				'SUM(shots_fired) as shots_fired_total'
			),
			'conditions' => $conditions,
			'group' => 'player_id'

		));

		return $leaderboards;
	}

	public function getMedicOnMedicHits($state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('type' => $state['gametype']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all') {
			$conditions[] = array('type' => $state['gametype']);
			
			if($state['gametype'] == 'league') {
				if(isset($state['show_subs']) && $state['show_subs'] == 'true')
					$conditions[] = array('is_sub >=' => 0);
				else
					$conditions[] = array('is_sub' => 0);
					
				if(!isset($state['show_finals']) || $state['show_finals'] != 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				}
			}
		}
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('event_id' => $state['leagueID']);

		$conditions[] = array('position' => 'Medic');

		$leaderboards = $this->find('all', array(
			'contain' => array(
				'Player' => array(
					'fields' => array(
						'player_name'
					)
				)
			),
			'fields' => array(
				'player_id',
				'SUM(medic_hits) as medic_hits_total',
			),
			'conditions' => $conditions,
			'group' => 'player_id'

		));

		return $leaderboards;
	}

	public function getPositionLeaderboards($position, $state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('type' => $state['gametype']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all') {
			$conditions[] = array('type' => $state['gametype']);
			
			if($state['gametype'] == 'league') {
				if(isset($state['show_subs']) && $state['show_subs'] == 'true')
					$conditions[] = array('is_sub >=' => 0);
				else
					$conditions[] = array('is_sub' => 0);
					
				if(!isset($state['show_finals']) || $state['show_finals'] != 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				}
			}
		}
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('event_id' => $state['leagueID']);

		$conditions[] = array('position' => $position);


		$leaderboards = $this->find('all', array(
			'contain' => array(
				'Player' => array(
					'fields' => array(
						'player_name'
					)
				)
			),
			'fields' => array(
				'player_id',
				'score',
				'mvp_points',
				'game_id'
			),
			'conditions' => $conditions,
			'order' => 'score DESC',
			'limit' => 500

		));

		return $leaderboards;
	}
	
	public function getPenaltyCount($state) {
		$conditions = array();
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('Scorecard.center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('Scorecard.type' => $state['gametype']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all') {
			$conditions[] = array('Scorecard.type' => $state['gametype']);
			
			if($state['gametype'] == 'league') {
				if(isset($state['show_subs']) && $state['show_subs'] == 'true')
					$conditions[] = array('Scorecard.is_sub >=' => 0);
				else
					$conditions[] = array('Scorecard.is_sub' => 0);
					
				if(!isset($state['show_finals']) || $state['show_finals'] != 'true') {
					$subQuery = new stdClass();
					$subQuery->type = "expression";
        			$subQuery->value = "game_id IN (SELECT game_id FROM league_games WHERE is_finals = 0 AND event_id='{$state['leagueID']}')";
       		 		$conditions[] = $subQuery;
				}
			}
		}
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$conditions[] = array('event_id' => $state['leagueID']);


		$leaderboards = $this->find('all', array(
			'contain' => array(
				'Player' => array(
					'fields' => array(
						'player_name'
					)
				)
			),
			'joins' => array(
				array(
					'table' => 'penalties',
					'alias' => 'Penalty',
					'type' => 'LEFT',
					'conditions' => array(
						'Penalty.scorecard_id = Scorecard.id',
					)
				)
			),
			'fields' => array(
				'player_id',
				'COUNT(Penalty.id) as penalties'
			),
			'conditions' => $conditions,
			'group' => 'player_id'

		));

		return $leaderboards;
	}

	public function getCurrentStreaks($state) {
		$where = "1";
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$where .= " AND center_id = $state[centerID]";
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$where .= " AND type = '$state[gametype]'";
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$where .= " AND event_id = $state[leagueID]";

		$streaks = $this->query("SELECT 
									streakset.player_id,
									players.player_name,
									streakset.gameresult,
									MAX(streakset.winlossstreak) AS maxstreak
								FROM
									(SELECT 
										gr.game_datetime,
										gr.player_id,
										gr.result,
										@curstatus:=gr.result AS gameresult,
										@curplayer:=gr.player_id AS curplayer,
										@winlossseq:=IF(@curplayer = @lastplayer, IF(@curstatus = @laststatus, @winlossseq + 1, 1), 1) AS winlossstreak,
										@laststatus:=@curstatus AS carryOverForNextRecord,
										@lastplayer:=@curplayer AS moreCarryOver
									FROM
										(SELECT 
											*
										FROM
											game_results
										WHERE $where
										ORDER BY player_id , game_datetime) AS gr, 
										(SELECT 
											@CurStatus:='',
											@curplayer:=0,
											@LastStatus:='',
											@lastplayer:=0,
											@WinLossSeq:=0
										) sqlvars) streakset
										LEFT JOIN
											players ON (streakset.player_id = players.id)
								WHERE
									game_datetime = (select max(game_datetime) from game_results where player_id=streakset.player_id)
								GROUP BY streakset.player_id , streakset.gameresult
								ORDER BY maxstreak DESC
		");

		return $streaks;
	}

	public function getWinStreaks($state) {
		$where = "1";
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$where .= " AND center_id = $state[centerID]";
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$where .= " AND type = '$state[gametype]'";
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$where .= " AND event_id = $state[leagueID]";

		$streaks = $this->query("SELECT 
    								streakset.player_id,
    								players.player_name,
    								streakset.gameresult,
    								MAX(streakset.winlossstreak) AS maxstreak
								FROM
    								(SELECT 
        								gr.game_datetime,
            							gr.player_id,
            							gr.result,
            							@curstatus:=gr.result AS gameresult,
            							@curplayer:=gr.player_id AS curplayer,
            							@winlossseq:=IF(@curplayer = @lastplayer, IF(@curstatus = @laststatus, @winlossseq + 1, 1), 1) AS winlossstreak,
            							@laststatus:=@curstatus AS carryOverForNextRecord,
           								@lastplayer:=@curplayer AS moreCarryOver
    								FROM
        								(SELECT 
        									*
    									FROM
        									game_results
        								WHERE $where
   										ORDER BY player_id , game_datetime) AS gr, (SELECT 
        																				@CurStatus:='',
																			            @curplayer:=0,
																			            @LastStatus:='',
																			            @lastplayer:=0,
																			            @WinLossSeq:=0
    									) sqlvars) streakset LEFT JOIN players ON (streakset.player_id = players.id)
								WHERE streakset.gameresult = 'W'
								GROUP BY streakset.player_id , streakset.gameresult
								ORDER BY maxstreak DESC
							");

		return $streaks;
	}

	public function getLossStreaks($state) {
		$where = "1";
		
		if(isset($state['centerID']) && $state['centerID'] > 0)
			$where .= " AND center_id = $state[centerID]";
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$where .= " AND type = '$state[gametype]'";
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0)
			$where .= " AND event_id = $state[leagueID]";
		
		$streaks = $this->query("SELECT 
    								streakset.player_id,
    								players.player_name,
    								streakset.gameresult,
    								MAX(streakset.winlossstreak) AS maxstreak
								FROM
    								(SELECT 
        								gr.game_datetime,
            							gr.player_id,
            							gr.result,
            							@curstatus:=gr.result AS gameresult,
            							@curplayer:=gr.player_id AS curplayer,
            							@winlossseq:=IF(@curplayer = @lastplayer, IF(@curstatus = @laststatus, @winlossseq + 1, 1), 1) AS winlossstreak,
            							@laststatus:=@curstatus AS carryOverForNextRecord,
           								@lastplayer:=@curplayer AS moreCarryOver
    								FROM
        								(SELECT 
        									*
    									FROM
        									game_results
        								WHERE $where
   										ORDER BY player_id , game_datetime) AS gr, (SELECT 
        																				@CurStatus:='',
																			            @curplayer:=0,
																			            @LastStatus:='',
																			            @lastplayer:=0,
																			            @WinLossSeq:=0
    									) sqlvars) streakset LEFT JOIN players ON (streakset.player_id = players.id)
								WHERE streakset.gameresult = 'L'
								GROUP BY streakset.player_id , streakset.gameresult
								ORDER BY maxstreak DESC
							");

		return $streaks;
	}

	public function getLeagueScorecardsByRound($round, $league_id) {
		//doesnt do shit with rounds yet, just pulls everything
		$conditions = array();
			
		$conditions[] = array('Scorecard.event_id' => $league_id);
	
		$scorecards = $this->find('all', array(
			'conditions' => $conditions,
			'contain' => array(
				'Game' => array()
			)
		));
		
		return $scorecards;
	}
	
	public function getTopTeams($min_games, $min_days, $state) {
		$matrix = $this->_loadMatrix($min_games, $min_days, $state);

		//reverse the matrix to make it a cost matrix
		$max = 0;
		foreach($matrix as $row) {
			foreach($row as $column) {
				if($column > $max) {
					$max = $column;
				}
			}
		}

		foreach($matrix as &$row) {
			foreach($row as &$column) {
				$column = $max - $column;
			}
		}

		//run the algorithm
		$M = $this->_munkres($matrix);

		//build the results
		$team_a = array();
		$r = 0;
		foreach($matrix as $key => $value) {
			for($c = 0; $c < count($M[$r]); $c++) {
				if($M[$r][$c] == 1) {
					switch($c) {
						case 0:
							$team_a['Ammo Carrier'] = array('position' => 'Ammo Carrier', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Ammo Carrier']));
							break;
						case 1:
							$team_a['Commander'] = array('position' => 'Commander', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Commander']));
							break;
						case 2:
							$team_a['Heavy Weapons'] = array('position' => 'Heavy Weapons', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Heavy Weapons']));
							break;
						case 3:
							$team_a['Medic'] = array('position' => 'Medic', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Medic']));
							break;
						case 4:
							$team_a['Scout'] = array('position' => 'Scout', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout']));
							break;
						case 5:
							$team_a['Scout2'] = array('position' => 'Scout2', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout']));
							break;
					}
					break;
				}
			}
			$r++;
		}
		
		foreach($team_a as $player) {
			unset($matrix[$player['player_id']]);
		}
		
		$M = $this->_munkres($matrix);
		$team_b = array();
		$r = 0;
		foreach($matrix as $key => $value) {
			for($c = 0; $c < count($M[$r]); $c++) {
				if($M[$r][$c] == 1) {
					switch($c) {
						case 0:
							$team_b['Ammo Carrier'] = array('position' => 'Ammo Carrier', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Ammo Carrier']));
							break;
						case 1:
							$team_b['Commander'] = array('position' => 'Commander', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Commander']));
							break;
						case 2:
							$team_b['Heavy Weapons'] = array('position' => 'Heavy Weapons', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Heavy Weapons']));
							break;
						case 3:
							$team_b['Medic'] = array('position' => 'Medic', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Medic']));
							break;
						case 4:
							$team_b['Scout'] = array('position' => 'Scout', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout']));
							break;
						case 5:
							$team_b['Scout2'] = array('position' => 'Scout2', 'player_id' => $key, 'player_name' => $this->Player->findById($key, array('player_name'))['Player']['player_name'], 'avg_mvp' => ($max - $value['Scout']));
							break;
					}
					break;
				}
			}
			$r++;
		}
	
		if(!isset($team_a['Ammo Carrier']))
			$team_a['Ammo Carrier'] = array('position' => 'Ammo Carrier', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_a['Commander']))
			$team_a['Commander'] = array('position' => 'Commander', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_a['Heavy Weapons']))
			$team_a['Heavy Weapons'] = array('position' => 'Heavy Weapons', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_a['Medic']))
			$team_a['Medic'] = array('position' => 'Medic', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_a['Scout']))
			$team_a['Scout'] = array('position' => 'Scout', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_a['Scout2']))
			$team_a['Scout2'] = array('position' => 'Scout2', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);

		if(!isset($team_b['Ammo Carrier']))
			$team_b['Ammo Carrier'] = array('position' => 'Ammo Carrier', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_b['Commander']))
			$team_b['Commander'] = array('position' => 'Commander', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_b['Heavy Weapons']))
			$team_b['Heavy Weapons'] = array('position' => 'Heavy Weapons', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_b['Medic']))
			$team_b['Medic'] = array('position' => 'Medic', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_b['Scout']))
			$team_b['Scout'] = array('position' => 'Scout', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);
		if(!isset($team_b['Scout2']))
			$team_b['Scout2'] = array('position' => 'Scout2', 'player_id' => 0, 'player_name' => 'N/A', 'avg_mvp' => 0);

		$results['team_a'][0] = $team_a['Commander'];
		$results['team_a'][1] = $team_a['Heavy Weapons'];
		$results['team_a'][2] = $team_a['Scout'];
		$results['team_a'][3] = $team_a['Scout2'];
		$results['team_a'][4] = $team_a['Ammo Carrier'];
		$results['team_a'][5] = $team_a['Medic'];

		$results['team_b'][0] = $team_b['Commander'];
		$results['team_b'][1] = $team_b['Heavy Weapons'];
		$results['team_b'][2] = $team_b['Scout'];
		$results['team_b'][3] = $team_b['Scout2'];
		$results['team_b'][4] = $team_b['Ammo Carrier'];
		$results['team_b'][5] = $team_b['Medic'];
	
		return $results;
	}
	
	protected function _loadMatrix($min_games, $min_days, $state) {
		$conditions = array();

		if(isset($state['centerID']) && $state['centerID'] > 0)
			$conditions[] = array('center_id' => $state['centerID']);
		
		if(isset($state['gametype']) && $state['gametype'] != 'all')
			$conditions[] = array('type' => $state['gametype']);
		
		if(isset($state['leagueID']) && $state['leagueID'] > 0) {
			$min_games = 9;
			$conditions[] = array('event_id' => $state['leagueID']);
		}
		
		if($min_days > 0 && isset($state['gametype']) && ($state['gametype'] == 'all' || $state['gametype'] == 'social')) {
			$conditions['DATEDIFF(DATE(NOW()),DATE(game_datetime)) <='] = $min_days;
		}

		$results = $this->find('all', array(
			'fields' => array(
				'player_id',
				'position',
				'AVG(mvp_points) as avg_mvp',
				'COUNT(game_datetime) as games_played'
			),
			'conditions' => $conditions,
			'group' => "player_id, position HAVING games_played >= $min_games"
		));
		
		$matrix = array();

		foreach($results as $key => $result) {
			$matrix[$result['Scorecard']['player_id']]['Ammo Carrier'] = 0.0;
			$matrix[$result['Scorecard']['player_id']]['Commander'] = 0.0;
			$matrix[$result['Scorecard']['player_id']]['Heavy Weapons'] = 0.0;
			$matrix[$result['Scorecard']['player_id']]['Medic'] = 0.0;
			$matrix[$result['Scorecard']['player_id']]['Scout'] = 0.0;
			$matrix[$result['Scorecard']['player_id']]['Scout2'] = 0.0;
		}
		
		foreach($results as $key => $result) {
			$matrix[$result['Scorecard']['player_id']][$result['Scorecard']['position']] = (float)$result[0]['avg_mvp'];
			if($result['Scorecard']['position'] == 'Scout') {
				$matrix[$result['Scorecard']['player_id']]['Scout2'] = (float)$result[0]['avg_mvp'];
			}
		}

		return $matrix;
	}
	
	protected function _munkres($matrix) {
		//Munkres implementation
		$C = array();
		$C_orig = array();
		$M = array();
		$path = array();
		$RowCover = array();
		$colCover = array();
		$nrow = 0;
		$ncol = 0;
		$path_count = 0;
		$path_row_0 = 0;
		$path_col_0 = 0;
		$asgn = 0;
		$step = 1;

		foreach($matrix as $row) {
			$ncol = 0;
			foreach($row as $column) {
				$C[$nrow][$ncol] = $column;
				$ncol++;
			}
			$nrow++;
		}
		
		while($ncol < $nrow) {
			for($r = 0; $r < $nrow; $r++) {
				$C[$r][$ncol] = 100;
			}
			$ncol++;
		}
		
		for($r = 0; $r < $nrow; $r++) {
			$RowCover[$r] = 0;
			for($c = 0; $c < $ncol; $c++) {
				$M[$r][$c] = 0;
			}
		}
		for($c = 0; $c < $ncol; $c++) {
			$ColCover[$c] = 0;
		}
		
		$ovl_done = false;
		
		while(!$ovl_done) {
			switch($step) {
				case 1:
					$min_in_row = 0;
					
					for($r = 0; $r < $nrow; $r++) {
						$min_in_row = $C[$r][0];
						for($c = 0; $c < $ncol; $c++) {
							if($C[$r][$c] < $min_in_row) {
								$min_in_row = $C[$r][$c];
							}
						}
						for($c = 0; $c < $ncol; $c++) {
							$C[$r][$c] -= $min_in_row;
						}
					}
					$step = 2;
					break;
				case 2:
					for($r = 0; $r < $nrow; $r++) {
						for($c = 0; $c < $ncol; $c++) {
							if($C[$r][$c] == 0 && $RowCover[$r] == 0 && $ColCover[$c] == 0) {
								$M[$r][$c] = 1;
								$RowCover[$r] = 1;
								$ColCover[$c] = 1;
							}
						}
					}
					for($r = 0; $r < $nrow; $r++) {
						$RowCover[$r] = 0;
					}
					for($c = 0; $c < $ncol; $c++) {
						$ColCover[$c] = 0;
					}
					$step = 3;
					break;
				case 3:
					$colcount = 0;
					for($r = 0; $r < $nrow; $r++) {
						for($c = 0; $c < $ncol; $c++) {
							if($M[$r][$c] == 1) {
								$ColCover[$c] = 1;
							}
						}
					}

					$colcount = 0;
					for($c = 0; $c < $ncol; $c++) {
						if($ColCover[$c] == 1) {
							$colcount += 1;
						}
					}
					if($colcount >= $ncol || $colcount >= $nrow) {
						$step = 7;
					} else {
						$step = 4;
					}
					break;
				case 4:
					$row = -1;
					$col = -1;
					$done = false;
					
					while (!$done) {
						$r = 0;
						$c = 0;
						$done2 = false;
						$row = -1;
						$col = -1;
						
						//find_a_zero
						while (!$done2) {
							$c = 0;
							while (true) {
								if ($C[$r][$c] == 0 && $RowCover[$r] == 0 && $ColCover[$c] == 0) {
									$row = $r;
									$col = $c;
									$done2 = true;
								}
								$c += 1;
								if ($c >= $ncol || $done2)
									break;
							}
							$r += 1;
							if ($r >= $nrow)
								$done2 = true;
						}
						
						if ($row == -1) {
							$done = true;
							$step = 6;
						} else {
							$M[$row][$col] = 2;
							
							//star_in_row
							$tmp = false;
							for($tmp_c = 0; $tmp_c < $ncol; $tmp_c++) {
								if($M[$row][$tmp_c] == 1) {
									$tmp = true;
								}
							}
							
							if ($tmp) {
								//find_star_in_row
								$col = -1;
								for($tmp_c = 0; $tmp_c < $ncol; $tmp_c++) {
									if ($M[$row][$tmp_c] == 1) {
										$col = $tmp_c;
									}
								}
			
								$RowCover[$row] = 1;
								$ColCover[$col] = 0;
							} else {
								$done = true;
								$step = 5;
								$path_row_0 = $row;
								$path_col_0 = $col;
							}
						}
					}
					break;
				case 5:
					$done = false;
					$r = -1;
					$c = -1;

					$path_count = 1;
					$path[$path_count - 1][0] = $path_row_0;
					$path[$path_count - 1][1] = $path_col_0;

					while (!$done) {
						//find_star_in_col
						$tmp_c = $path[$path_count - 1][1];
						$r = -1;
						for ($i = 0; $i < $nrow; $i++) {
							if ($M[$i][$tmp_c] == 1) {
								$r = $i;
							}
						}
						
						if ($r > -1) {
							$path_count += 1;
							$path[$path_count - 1][0] = $r;
							$path[$path_count - 1][1] = $path[$path_count - 2][1];
						} else {
							$done = true;
						}
						if (!$done)	{
							//find_prime_in_row
							$tmp_r = $path[$path_count - 1][0];
							 for ($j = 0; $j < $ncol; $j++) {
								if ($M[$tmp_r][$j] == 2) {
									$c = $j;
								}
							}
						
							$path_count += 1;
							$path[$path_count - 1][0] = $path[$path_count - 2][0];
							$path[$path_count - 1][1] = $c;
						}
					}
					//augment_path();
					for ($p = 0; $p < $path_count; $p++)
						if ($M[$path[$p][0]][$path[$p][1]] == 1)
							$M[$path[$p][0]][$path[$p][1]] = 0;
						else
							$M[$path[$p][0]][$path[$p][1]] = 1;
					
					//clear_covers();
					for ($r = 0; $r < $nrow; $r++)
						$RowCover[$r] = 0;
					for ($c = 0; $c < $ncol; $c++)
						$ColCover[$c] = 0;
					
					//erase_primes();
					for ($r = 0; $r < $nrow; $r++)
						for ($c = 0; $c < $ncol; $c++)
							if ($M[$r][$c] == 2)
								$M[$r][$c] = 0;
					
					$step = 3;
					break;
				case 6:
					$minval = 100;
					
					for ($r = 0; $r < $nrow; $r++) {
						for ($c = 0; $c < $ncol; $c++) {
							if ($RowCover[$r] == 0 && $ColCover[$c] == 0) {
								if ($minval > $C[$r][$c]) {
									$minval = $C[$r][$c];
								}
							}
						}
					}

					for ($r = 0; $r < $nrow; $r++) {
						for ($c = 0; $c < $ncol; $c++) {
							if ($RowCover[$r] == 1) {
								$C[$r][$c] += $minval;
							}
							if ($ColCover[$c] == 0) {
								$C[$r][$c] -= $minval;
							}
						}
					}
					$step = 4;
					break;
				case 7:
					$ovl_done = true;
					break;
			}
		}
		
		return $M;
	}

	public function getDatabaseStats() {
		$stats = $this->find('first', array(
			'fields' => array(
				'COUNT(id) as total_scorecards',
				'SUM(shot_opponent) as total_hits'
			)
		));

		return $stats;
	}
}