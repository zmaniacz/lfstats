<?php

class ScorecardsController extends AppController {

	public function beforeFilter() {
		$this->Auth->allow(
			'index',
			'landing',
			'setState',
			'pickCenter',
			'pickLeague',
			'overall',
			'getOverallStats',
			'getOverallAverages',
			'getOverallMedicHits',
			'nightly',
			'tournament',
			'nightlySummaryStats',
			'nightlyScorecards',
			'nightlyGames',
			'nightlyMedicHits',
			'allcenter',
			'playerScorecards',
			'leaderboards',
			'getMVPBreakdown',
            'getHitBreakdown',
			'filterSub',
			'filterFinals',
			'filterRounds',
			'allstar',
			'getAllStarStats',
			'getComparison',
			'getPlayerHitBreakdown',
			'getAllCenter'
		);
		parent::beforeFilter();
	}

	public function index() {
		$this->redirect(array('controller' => 'scorecards', 'action' => 'nightly', '?' => array('gametype' => $this->Session->read('state.gametype'), 'centerID' => $this->Session->read('state.centerID'), 'leagueID' => $this->Session->read('state.leagueID'))));
	}

	public function landing() {
		$this->layout = 'landing';

		$events = $this->Event->getEventList(null, 10, null);
		$this->set('events', $events);
	}
	
	public function setState($gametype, $league_id, $center_id) {
		$this->Session->write('state', '');
		
		$this->Session->write('state.gametype', $gametype);
		
		if(!is_null($league_id))
			$this->Session->write('state.leagueID', $league_id);
			
		if(!is_null($center_id))
			$this->Session->write('state.centerID', $center_id);
		
		if($gametype == 'all' || $gametype == 'social')
			$this->redirect(array('controller' => 'scorecards', 'action' => 'nightly'));
			
		if($gametype == 'league')
			$this->redirect(array('controller' => 'leagues', 'action' => 'standings'));
	}
	
	public function phpview() {
	}
	
	public function overall() {	
    }

	public function getComparison($player1_id, $player2_id) {
		App::import('Vendor','CosineSimilarity',array('file' => 'CosineSimilarity/CosineSimilarity.php'));
		$compare = new CosineSimilarity();

		$player1_stats = $this->Scorecard->getComparableMVP($player1_id);
		$player2_stats = $this->Scorecard->getComparableMVP($player2_id);

		$max = max(max($player1_stats), max($player2_stats));
		$min = min(min($player1_stats), min($player2_stats));

		foreach($player1_stats as &$stat) {
			$stat = ($stat - $min) / ($max - $min);
		}

		foreach($player2_stats as &$stat) {
			$stat = ($stat - $min) / ($max - $min);
		}

		$distance = $compare->similarity($player1_stats, $player2_stats);

		$this->set('response', $distance);
	}
	
	public function getOverallStats($position) {
		switch ($position) {
			case 'commander':
				$this->set('response', $this->Scorecard->getPositionStats('Commander',$this->Session->read('state')));
				break;
			case 'heavy':
				$this->set('response', $this->Scorecard->getPositionStats('Heavy Weapons',$this->Session->read('state')));
				break;
			case 'scout':
				$this->set('response', $this->Scorecard->getPositionStats('Scout',$this->Session->read('state')));
				break;
			case 'ammo':
				$this->set('response', $this->Scorecard->getPositionStats('Ammo Carrier',$this->Session->read('state')));
				break;
			case 'medic':
				$this->set('response', $this->Scorecard->getPositionStats('Medic',$this->Session->read('state')));
				break;
		}
	}

	public function getAllStarStats() {
		$this->set('response', $this->Scorecard->getAllAvgMVP($this->Session->read('state')));
	}
	
	public function getOverallAverages() {
		$this->set('response', $this->Scorecard->getAllAvgMVP($this->Session->read('state')));
	}
	
	public function getOverallMedicHits() {
		$this->set('response', $this->Scorecard->getMedicHitStats($this->Session->read('state')));
	}
	
	public function nightly() {
		$date = (empty($this->request->query('date'))) ? null : $this->request->query('date');

		if($this->Session->read('state.isComp') > 0)
			$this->redirect(array('controller' => 'leagues', 'action' => 'standings'));
		
		$game_dates = $this->Scorecard->getGameDates($this->Session->read('state'));
		$this->set('game_dates', $game_dates);
		
		if($this->request->isPost()) {
			$date = $this->request->data['Scorecard']['date'];
		}

		if(empty($date))
			$date = reset($game_dates);

		$this->set('current_date', $date);
	}
	
	public function nightlyScorecards() {
		$date = (empty($this->request->query('date'))) ? null : $this->request->query('date');
		$this->set('data', $this->Scorecard->getScorecardsByDate($date, $this->Session->read('state')));
	}

	public function nightlyMedicHits() {
		$date = (empty($this->request->query('date'))) ? null : $this->request->query('date');
		$medic_hits = $this->Scorecard->getMedicHitStatsByDate($date, $this->Session->read('state'));

		$data = array();
		foreach($medic_hits as $medic) {
			$data[] = array(
				'player_name' => $medic['Scorecard']['player_name'],
				'player_id' => $medic['Scorecard']['player_id'],
				'total_medic_hits' => $medic[0]['total_medic_hits'],
				'medic_hits_per_game' => $medic[0]['medic_hits_per_game'],
				'games_played' => $medic[0]['games_played'],
				'non_resup_total_medic_hits' => $medic['ScorecardNoResup']['total_medic_hits'],
				'non_resup_medic_hits_per_game' => $medic['ScorecardNoResup']['medic_hits_per_game'],
				'non_resup_games_played' => $medic['ScorecardNoResup']['games_played'],
			);
		}

		$this->set('data', $data);
	}

	public function nightlySummaryStats() {
		$date = (empty($this->request->query('date'))) ? null : $this->request->query('date');
		$nightly = $this->Scorecard->getNightlyStatsByDate($date, $this->Session->read('state'));
		$overall = $this->Scorecard->getAllAvgMVP($this->Session->read('state'));

		$data = array();
		foreach ($nightly as $score) {
			$response[$score['Player']['id']] = array(	
				'player_name' => $score['Player']['player_name'],
				'player_id' => $score['Player']['id'],
				'min_score' => $score[0]['min_score'],
				'avg_score' => $score[0]['avg_score'],
				'max_score' => $score[0]['max_score'],
				'min_mvp' =>  $score[0]['min_mvp'],
				'avg_mvp' =>  $score[0]['avg_mvp'],
				'max_mvp' =>  $score[0]['max_mvp'],
				'avg_acc' => $score[0]['avg_acc'],
				'hit_diff' => $score[0]['hit_diff'],
				'medic_hits' => $score[0]['medic_hits'],
				'elim_rate' => $score[0]['elim_rate'],
				'games_played' => $score[0]['games_played'],
				'games_won' => $score[0]['games_won']
			);
		}
	
		foreach ($overall as $key => $value) {
			if(isset($response[$key])) {
				$response[$key]['overall_avg_mvp'] = $value['avg_avg_mvp'];
				$response[$key]['overall_avg_acc'] = $value['avg_avg_acc'];
			}
		}

		$this->set('data', array_values($response));
	}

	public function playerScorecards($id) {
		$this->request->onlyAllow('ajax');
		$this->set('scorecards', $this->Scorecard->getPlayerGamesScorecardsById($id, $this->Session->read('state')));
	}
	
	public function rebuild() {
		//$mvps = $this->Scorecard->generateMVP();
		//$games = $this->Scorecard->generateGames(1);
		//$players = $this->Scorecard->generatePlayers($this->Session->read('center.Center.id'), $this->Session->read('filter'));
		//$existing = $players['existing'];
		//$new = $players['new'];
		
		//$this->Session->setFlash("Added $mvps MVP entries"); //, $games game entries, games for $existing players and $new new players");
		$this->redirect(array('controller' => 'scorecards', 'action' => 'nightly'));
	}
	
	public function allcenter() {
	}

	public function getAllCenter() {
		$min_games = (empty($this->request->query('min_games'))) ? 15 : $this->request->query('min_games');
		$min_days = (empty($this->request->query('min_days'))) ? 365 : $this->request->query('min_days');
		$this->set('all_center', $this->Scorecard->getTopTeams($min_games, $min_days, $this->Session->read('state')));
	}

	public function allstar() {

	}

	public function leaderboards() {
		$this->set('leaderboards', $this->Scorecard->getLeaderboards($this->Session->read('state')));
		$this->set('commander', $this->Scorecard->getPositionLeaderboards('Commander', $this->Session->read('state')));
		$this->set('heavy', $this->Scorecard->getPositionLeaderboards('Heavy Weapons', $this->Session->read('state')));
		$this->set('scout', $this->Scorecard->getPositionLeaderboards('Scout', $this->Session->read('state')));
		$this->set('ammo', $this->Scorecard->getPositionLeaderboards('Ammo Carrier', $this->Session->read('state')));
		$this->set('medic', $this->Scorecard->getPositionLeaderboards('Medic', $this->Session->read('state')));
		$this->set('penalties', $this->Scorecard->getPenaltyCount($this->Session->read('state')));
		$this->set('winstreaks', $this->Scorecard->getWinStreaks($this->Session->read('state')));
		$this->set('lossstreaks', $this->Scorecard->getLossStreaks($this->Session->read('state')));
		$this->set('current_streaks', $this->Scorecard->getCurrentStreaks($this->Session->read('state')));
		$this->set('medic_on_medic', $this->Scorecard->getMedicOnMedicHits($this->Session->read('state')));
	}
	
	public function getMVPBreakdown($id) {
		$this->request->allowMethod('ajax');
		$scorecard = $this->Scorecard->find('first', 
			array(
				'contain' => array(
					'Penalty'
				),
				'conditions' => array(
					'id' => $id
				)
			)
		);
		
		$this->set('score', $scorecard);
	}
    
    public function getHitBreakdown($player_id, $game_id) {
        $this->set('hits', $this->Scorecard->getHitDetails($player_id, $game_id));
        $this->set('player_id', $player_id);
    }

	public function getPlayerHitBreakdown($player_id) {
        $this->set('data', $this->Scorecard->getPlayerHitDetails($player_id, $this->Session->read('state')));
		$this->set('players', $this->Scorecard->Player->find('list'));
    }
	
	public function ajax_switchSub($id) {
		$this->request->onlyAllow('ajax');

		$scorecard = $this->Scorecard->read(null, $id);

		$is_sub = ($scorecard['Scorecard']['is_sub']) ? 0 : 1;
		
		$this->Scorecard->set('is_sub', $is_sub);
		
		if($this->Scorecard->save()) {
			return new CakeResponse(array('body' => json_encode(array('id' => $id, 'is_sub' => $is_sub))));
		}
	}
	
	public function filterSub($showSubs = false) {
		$this->Session->write('state.show_subs', $showSubs);
		$this->redirect($this->request->referer());
	}
	
	public function filterFinals($showFinals = false) {
		$this->Session->write('state.show_finals', $showFinals);
		$this->redirect($this->request->referer());
	}
	
	public function filterRounds($showRounds = false) {
		$this->Session->write('state.show_rounds', $showRounds);
		$this->redirect($this->request->referer());
	}
}