<?php
App::uses('AppController', 'Controller');
/**
 * Games Controller
 *
 * @property Game $Game
 * @property PaginatorComponent $Paginator
 * @property SessionComponent $Session
 */
class GamesController extends AppController {

/**
 * Components
 *
 * @var array
 */
	public $components = array('Paginator', 'Session');

	public $uses = array('Game','Player');

	public function beforeFilter() {
		$this->Auth->allow('index','view','overall','overallWinLossDetail','getGameList','getGameMatchups');
		parent::beforeFilter();
	}

/**
 * index method
 *
 * @return void
 */
	public function index() {
		$this->set('games', $this->Game->getGameList(null, $this->Session->read('state')));
	}

/**
 * view method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function view($id = null) {
		if (!$this->Game->exists($id)) {
			throw new NotFoundException(__('Invalid game'));
		}

		if ($this->request->is(array('post', 'put'))) {
			if ($this->Game->save($this->request->data)) {
				
				if(!empty($this->request->data['Game']['match'])) {
					$this->loadModel('Match');
					$match = explode("|", $this->request->data['Game']['match']);
					$this->Match->addGame($match[0], $match[1], $this->request->data['Game']['id']);
				}
				
				$this->Session->setFlash(__('The game has been saved.'));
				return $this->redirect(array('action' => 'view', $id));
			} else {
				$this->Session->setFlash(__('The game could not be saved. Please, try again.'));
			}
		} else {
			$this->loadModel('Event');

			$game = $this->Game->getGameDetails($id);
			$this->request->data = $game;
			
			foreach ($game['Scorecard'] as $key => $row) {
				$team[$key] = $row['team'];
				$rank[$key] = $row['rank'];
			}
			
			if(!empty($team)) {
				if($game['Game']['winner'] == 'red')
					array_multisort($team, SORT_DESC, $rank, SORT_ASC, $game['Scorecard']);
				else
					array_multisort($team, SORT_ASC, $rank, SORT_ASC, $game['Scorecard']);
			}

			if($game['Game']['type'] == 'league' || $game['Game']['type'] == 'tournament') {
				$this->loadModel('LeagueGame');
				
				$this->set('teams', $this->Event->getTeams($game['Game']['event_id']));
				$this->set('available_matches', $this->Event->getAvailableMatches($game));
			}
			
			$this->set('neighbors', $this->Game->getPrevNextGame($game['Game']['id']));
			
			$this->set('game', $game);
		}
	}

	public function getGameMatchups($game_id) {
		$this->set('data', $this->Game->getMatchups($game_id));
	}

/**
 * edit method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function edit($id = null) {
		if (!$this->Game->exists($id)) {
			throw new NotFoundException(__('Invalid game'));
		}
		if ($this->request->is(array('post', 'put'))) {
			if ($this->Game->save($this->request->data)) {
				$this->Session->setFlash(__('The game has been saved.'));
				return $this->redirect(array('action' => 'view', $id));
			} else {
				$this->Session->setFlash(__('The game could not be saved. Please, try again.'));
			}
		} else {
			$this->loadModel('Event');
			
			$options = array('conditions' => array('Game.' . $this->Game->primaryKey => $id));
			$this->request->data = $this->Game->find('first', $options);
			if($this->request->data['Game']['type'] == 'league' || $this->request->data['Game']['type'] == 'tournament') {
				$this->set('teams', $this->Event->getTeams($this->request->data['Game']['event_id']));
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
		$this->Game->id = $id;
		if (!$this->Game->exists()) {
			throw new NotFoundException(__('Invalid game'));
		}

		if ($this->Game->delete()) {
			$this->Session->setFlash(__('The game has been deleted.'));
		} else {
			$this->Session->setFlash(__('The game could not be deleted. Please, try again.'));
		}
		return $this->redirect(array('controller' => 'Games', 'action' => 'index'));
	}

	public function overall() {
	}
	
	public function getGameList() {
		$date = (empty($this->request->query('date'))) ? null : $this->request->query('date');
		$this->set('data', $this->Game->getGameList($date, $this->Session->read('state')));
	}
	
	public function overallWinLossDetail() {
		$this->set('overall', $this->Game->getOverallStats($this->Session->read('state')));
		$this->set('overall_averages', $this->Game->Scorecard->getOverallAverages($this->Session->read('state')));
	}
}
