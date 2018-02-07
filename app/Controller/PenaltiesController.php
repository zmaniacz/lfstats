<?php
App::uses('AppController', 'Controller');
/**
 * Penalties Controller
 *
 * @property Penalty $Penalty
 * @property PaginatorComponent $Paginator
 * @property SessionComponent $Session
 */
class PenaltiesController extends AppController {

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
		$this->set('penalties', $this->Penalty->getPenalties($this->Session->read('state')));
	}

/**
 * view method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function view($id = null) {
		if (!$this->Penalty->exists($id)) {
			throw new NotFoundException(__('Invalid penalty'));
		}
		$options = array('conditions' => array('Penalty.' . $this->Penalty->primaryKey => $id));
		$this->Penalty->contain(array(
			'Scorecard' => array(
				'fields' => array(),
				'Game' => array(
					'fields' => array('id','game_name','game_description','game_datetime')	
				),
				'Player' => array(
					'fields' => array('id','player_name')
				)
			)
		));
		$this->set('penalty', $this->Penalty->find('first', $options));
	}

/**
 * add method
 *
 * @return void
 */
	public function add($scorecard_id) {
		if (!$this->Penalty->Scorecard->exists($scorecard_id)) {
			throw new NotFoundException(__('Invalid scorecard'));
		}
		if ($this->request->is('post')) {
			$this->Penalty->create();
			if ($this->Penalty->save($this->request->data)) {
				$this->Session->setFlash(__('The penalty has been saved.'));

				$scorecard = $this->Penalty->Scorecard->find('first', array(
					'contain' => array(
						'Game' => array(
							'Match'
						)
					),
					'conditions' => array('Scorecard.id' => $this->request->data['Penalty']['scorecard_id'])
				));

				//add a penalty to the scorecard record and recalc MVP
				$scorecard['Scorecard']['penalties'] += 1;
				$scorecard['Scorecard']['mvp_points'] = null;
				$this->Penalty->Scorecard->save($scorecard);
				$this->Penalty->Scorecard->generateMVP();

				$this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);
				
				return $this->redirect(array('controller' => 'Games', 'action' => 'view', $scorecard['Scorecard']['game_id']));
			} else {
				$this->Session->setFlash(__('The penalty could not be saved. Please, try again.'));
			}
		}
		
		$scorecards = $this->Penalty->Scorecard->find('list', array('conditions' => array('Scorecard.id' => $scorecard_id)));
		$this->set(compact('scorecards'));
	}

/**
 * edit method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function edit($id = null) {
		if (!$this->Penalty->exists($id)) {
			throw new NotFoundException(__('Invalid penalty'));
		}
		
		if ($this->request->is(array('post', 'put'))) {
			
			$penalty = $this->Penalty->findById($id);
			$scorecard = $this->Penalty->Scorecard->find('first', array(
				'contain' => array(
					'Game' => array(
						'Match'
					)
				),
				'conditions' => array('Scorecard.id' => $penalty['Penalty']['scorecard_id'])
			));

			if ($this->Penalty->save($this->request->data)) {
				$scorecard['Scorecard']['mvp_points'] = null;
				$this->Penalty->Scorecard->save($scorecard);
				$this->Penalty->Scorecard->generateMVP();
				
				$this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);
				
				$this->Session->setFlash(__('The penalty has been saved.'));
				return $this->redirect(array('controller' => 'Games', 'action' => 'view', $scorecard['Scorecard']['game_id']));
			} else {
				$this->Session->setFlash(__('The penalty could not be saved. Please, try again.'));
			}
		} else {
			$options = array('conditions' => array('Penalty.' . $this->Penalty->primaryKey => $id));
			$this->request->data = $this->Penalty->find('first', $options);
		}
		
		$scorecards = $this->Penalty->Scorecard->find('list');
		$this->set(compact('scorecards'));
	}

/**
 * delete method
 *
 * @throws NotFoundException
 * @param string $id
 * @return void
 */
	public function delete($id = null) {
		$this->Penalty->id = $id;
		if (!$this->Penalty->exists()) {
			throw new NotFoundException(__('Invalid penalty'));
		}

		$penalty = $this->Penalty->findById($id);
		$scorecard = $this->Penalty->Scorecard->find('first', array(
			'contain' => array(
				'Game' => array(
					'Match'
				)
			),
			'conditions' => array('Scorecard.id' => $penalty['Penalty']['scorecard_id'])
		));

		if ($this->Penalty->delete()) {
			$this->Session->setFlash(__('The penalty has been deleted.'), 'default', array('class' => 'alert-success'));
			
			//remove a penalty to the socrecard record and recalc MVP
			$scorecard['Scorecard']['penalties'] -= 1;
			if($scorecard['Scorecard']['penalties'] < 0)
				$scorecard['Scorecard']['penalties'] = 0;
			
			$scorecard['Scorecard']['mvp_points'] = null;
			$this->Penalty->Scorecard->save($scorecard);
			$this->Penalty->Scorecard->generateMVP();
		} else {
			$this->Session->setFlash(__('The penalty could not be deleted. Please, try again.'), 'default', array('class' => 'alert-danger'));
		}
		
		$this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);

		return $this->redirect(array('controller' => 'Games', 'action' => 'view', $scorecard['Scorecard']['game_id']));
	}
	
	public function getPenalty($id) {
		$this->request->allowMethod('ajax');
		$options = array('conditions' => array('Penalty.' . $this->Penalty->primaryKey => $id));
		$this->Penalty->contain(array(
			'Scorecard' => array(
				'fields' => array(),
				'Game' => array(
					'fields' => array('id','game_name','game_description','game_datetime','center_id')	
				),
				'Player' => array(
					'fields' => array('id','player_name')
				)
			)
		));
		$this->set('penalty', $this->Penalty->find('first', $options));
	}
}
