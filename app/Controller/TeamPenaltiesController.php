<?php
App::uses('AppController', 'Controller');
/**
 * Penalties Controller
 *
 * @property Penalty $Penalty
 * @property PaginatorComponent $Paginator
 * @property SessionComponent $Session
 */
class TeamPenaltiesController extends AppController {

/**
 * Components
 *
 * @var array
 */
	public $components = array('Paginator', 'Session');

	public function beforeFilter() {
		$this->Auth->allow('index','view','getPenalty');
		parent::beforeFilter();
	}


/**
 * index method
 *
 * @return void
 */
	public function index() {
		$this->set('teamPenalties', $this->TeamPenalty->find('all', array('contain' => 'Game')));
	}

/**
 * view method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function view($id = null) {
		if (!$this->TeamPenalty->exists($id)) {
			throw new NotFoundException(__('Invalid penalty'));
		}
		$options = array('conditions' => array('TeamPenalty.' . $this->TeamPenalty->primaryKey => $id));
		$this->TeamPenalty->contain(array('Game'));
		$this->set('teamPenalty', $this->TeamPenalty->find('first', $options));
	}

/**
 * add method
 *
 * @return void
 */
	public function add($game_id, $team_color) {
		if (!$this->TeamPenalty->Game->exists($game_id)) {
			throw new NotFoundException(__('Invalid game'));
		}
		if ($this->request->is('post')) {
			$this->TeamPenalty->create();
			if ($this->TeamPenalty->save($this->request->data)) {
				$this->Session->setFlash(__('The team penalty has been saved.'));

				$this->TeamPenalty->Game->updateGameWinner($game_id);
				
				return $this->redirect(array('controller' => 'Games', 'action' => 'view', $game_id));
			} else {
				$this->Session->setFlash(__('The team penalty could not be saved. Please, try again.'));
			}
		} else {
			$this->request->data['TeamPenalty']['game_id'] = $game_id;
			$this->request->data['TeamPenalty']['team_color'] = $team_color;
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
		if (!$this->TeamPenalty->exists($id)) {
			throw new NotFoundException(__('Invalid team penalty'));
		}
		
		if ($this->request->is(array('post', 'put'))) {
			
			$penalty = $this->TeamPenalty->findById($id);

			if ($this->TeamPenalty->save($this->request->data)) {
				$this->TeamPenalty->Game->updateGameWinner($penalty['TeamPenalty']['game_id']);
				
				$this->Session->setFlash(__('The team penalty has been saved.'));
				return $this->redirect(array('controller' => 'Games', 'action' => 'view', $penalty['TeamPenalty']['game_id']));
			} else {
				$this->Session->setFlash(__('The team penalty could not be saved. Please, try again.'));
			}
		} else {
			$options = array('conditions' => array('TeamPenalty.' . $this->TeamPenalty->primaryKey => $id));
			$this->request->data = $this->TeamPenalty->find('first', $options);
		}
		
		$games = $this->TeamPenalty->Game->find('list');
		$this->set(compact('games'));
	}

/**
 * delete method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function delete($id = null) {
		$this->TeamPenalty->id = $id;
		if (!$this->TeamPenalty->exists()) {
			throw new NotFoundException(__('Invalid team penalty'));
		}

		$penalty = $this->TeamPenalty->findById($id);

		if ($this->TeamPenalty->delete()) {
			$this->Session->setFlash(__('The team penalty has been deleted.'), 'default', array('class' => 'alert-success'));
		} else {
			$this->Session->setFlash(__('The team penalty could not be deleted. Please, try again.'), 'default', array('class' => 'alert-danger'));
		}
		
		$this->TeamPenalty->Game->updateGameWinner($penalty['TeamPenalty']['game_id']);

		return $this->redirect(array('controller' => 'Games', 'action' => 'view', $penalty['TeamPenalty']['game_id']));
	}
	
	public function getTeamPenalty($id) {
		$this->request->allowMethod('ajax');
		$options = array('conditions' => array('TeamPenalty.' . $this->TeamPenalty->primaryKey => $id));
		$this->TeamPenalty->contain(array('Game'));
		$this->set('team_penalty', $this->TeamPenalty->find('first', $options));
	}
}
