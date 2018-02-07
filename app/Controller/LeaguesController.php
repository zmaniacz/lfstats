<?php
App::uses('AppController', 'Controller');

class LeaguesController extends AppController {
	public $uses = array('Event','Scorecard','Game');

	public function beforeFilter() {
		$this->Auth->allow('index','standings','ajax_getLeagues','ajax_getTeams','ajax_getMatchDetails','ajax_getTeamStandings','bracket');
		parent::beforeFilter();
	}

/**
 * index method
 *
 * @return void
 */
	public function index() {
		$this->redirect(array('controller' => 'leagues', 'action' => 'standings'));
	}

	public function standings() {
		if($this->Session->read('state.isComp') < 1)
			$this->redirect(array('controller' => 'scorecards', 'action' => 'nightly'));
		
		$this->set('teams',  $this->Event->EventTeam->find('list', array('fields' => array('EventTeam.name'), 'conditions' => array('event_id' => $this->Session->read('state.leagueID')))));
		$this->set('details', $this->Event->getLeagueDetails($this->Session->read('state')));
	}

	public function bracket() {
		$this->set('teams',  $this->Event->EventTeam->find('list', array('fields' => array('EventTeam.name'), 'conditions' => array('event_id' => $this->Session->read('state.leagueID')))));
		$this->set('details', $this->Event->getLeagueDetails($this->Session->read('state')));
	}

	public function ajax_getTeamStandings($round = null) {
		$this->set('data', $this->Event->getTeamStandings($this->Session->read('state'), $round));
	}

	public function ajax_getLeagues() {
		$this->request->onlyAllow('ajax');
		$this->set('leagues', $this->Event->getLeagues());
	}

	public function ajax_getTeams() {
		$this->request->onlyAllow('ajax');
		$this->set('teams', $this->Event->getTeamStandings($this->Session->read('state')));
	}
	
	public function ajax_getStandings() {
		$this->request->onlyAllow('ajax');
		$this->set('standings', $this->Event->getTeamStandings($this->Session->read('state')));
	}

	public function ajax_assignTeam($match_id, $team_number, $team_id) {
		$this->request->onlyAllow('ajax');

		$match = $this->Event->Round->Match->read(null, $match_id);
		
		if($team_number == 1)
			$this->Event->Round->Match->set('team_1_id', $team_id);
		else
			$this->Event->Round->Match->set('team_2_id', $team_id);
		
		if($this->Event->Round->Match->save()) {
			return new CakeResponse(array('body' => json_encode(array('match_id' => $match_id, 'team_number' => $team_number, 'team_id' => $team_id))));
		}
	}

	public function ajax_getMatchDetails($match_id) {
		$this->set('match', $this->Event->Round->Match->find('first', array(
			'contain' => array(
				'Game_1',
				'Game_2',
				'Team_1',
				'Team_2',
				'Round'
			),
			'conditions' => array(
				'Match.id' => $match_id
			)
		)));
	}

/**
 * add method
 *
 * @return void
 */
	public function add() {
		if ($this->request->is('post')) {
			$this->Event->create();
			if ($this->Event->save($this->request->data)) {
				return $this->flash(__('The event has been saved.'), array('controller' => 'leagues', 'action' => 'standings'));
			}
		}
		$centers = $this->Event->Center->find('list');
		$this->set(compact('centers'));
	}

	public function addTeam() {
		if ($this->request->is('post')) {
			$this->Event->EventTeam->create();
			if ($this->Event->EventTeam->save($this->request->data)) {
				$this->Session->setFlash(__('The team has been saved.'));
				$this->redirect(array('controller' => 'leagues', 'action' => 'standings'));
			}
		}

		$leagues = $this->Event->find('list', array('conditions' => array('id' => $this->Session->read('state.leagueID'))));
		$this->set(compact('leagues'));
	}
	
	public function addRound() {
		if ($this->request->is('post')) {
			$this->Event->Round->create();
			if ($this->Event->Round->save($this->request->data)) {
				$this->Session->setFlash(__('The round has been created.'));
				$this->redirect(array('controller' => 'leagues', 'action' => 'standings'));
			}
		}
	}
	
	public function addMatch($league_id, $round_id) {
		if ($this->request->is('post')) {
			$match = $this->Event->Round->Match->find('first', array(
				'conditions' => array(
					'round_id' => $this->request->data['Event']['round_id']
				),
				'order' => 'match DESC'
			));
			$match_start = ($match) ? $match['Match']['match'] : 0;
			
			for($i = 0; $i < $this->request->data['Event']['matches']; $i++) {
				$match_start++;
				$this->Event->Round->Match->create();
				$this->Event->Round->Match->set('match', $match_start);
				$this->Event->Round->Match->set('round_id', $this->request->data['Event']['round_id']);
				$this->Event->Round->Match->save();
			}
			
			$this->redirect(array('controller' => 'leagues', 'action' => 'standings'));
		} else {
			$this->set('league', $this->Event->findById($league_id));
			$this->set('round', $this->Event->Round->findById($round_id));
		}
	}

/**
 * edit method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function edit($id = null) {
		if (!$this->Event->exists($id)) {
			throw new NotFoundException(__('Invalid event'));
		}
		if ($this->request->is(array('post', 'put'))) {
			if ($this->Event->save($this->request->data)) {
				return $this->flash(__('The event has been saved.'), array('action' => 'index'));
			}
		} else {
			$options = array('conditions' => array('Event.' . $this->Event->primaryKey => $id));
			$this->request->data = $this->Event->find('first', $options);
		}
		$centers = $this->Event->Center->find('list');
		$this->set(compact('centers'));
	}
	
	public function editMatch($id = null) {
		if (!$this->Event->Round->Match->exists($id)) {
			throw new NotFoundException(__('Invalid match'));
		}
		if ($this->request->is(array('post', 'put'))) {
			if($this->Event->Round->Match->save($this->request->data)) {
				$this->Session->setFlash(__('Match saved'));
				$this->redirect(array('controller' => 'leagues', 'action' => 'standings'));
			}
		}
	}

/**
 * delete method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function delete($id = null) {
		$this->Event->id = $id;
		if (!$this->Event->exists()) {
			throw new NotFoundException(__('Invalid event'));
		}
		$this->request->allowMethod('post', 'delete');
		if ($this->Event->delete()) {
			return $this->flash(__('The event has been deleted.'), array('action' => 'index'));
		} else {
			return $this->flash(__('The event could not be deleted. Please, try again.'), array('action' => 'index'));
		}
	}
}
