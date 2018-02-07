<?php
App::uses('AppModel', 'Model');

class LeagueGame extends AppModel {
	public function getPrevNextGame($game_id) {
		$games = $this->find('all');
		
		$results['prev'] = array();
		$results['next'] = array();
		foreach($games as $key => $value) {
			if($value['LeagueGame']['game_id'] == $game_id) {
				$results['prev'] = (isset($games[$key-1])) ? $games[$key-1] : null;
				$results['next'] = (isset($games[$key+1])) ? $games[$key+1] : null;
				break;
			}
		}
		
		return $results;
	}
}