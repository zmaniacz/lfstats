<?php
App::uses('AppController', 'Controller');

class TeamsController extends AppController {
	public $uses = array('EventTeam');
	
	public function beforeFilter() {
		$this->Auth->allow('view');
		parent::beforeFilter();
	}
	
	public function view($id = null) {
		if (!$this->EventTeam->exists($id)) {
			throw new NotFoundException(__('Invalid team'));
		}

		$team = $this->EventTeam->find('first', array(
			'contain' => array(
				'Red_Game' => array(
					'Red_Scorecard'
				),
				'Green_Game'=> array(
					'Green_Scorecard'
				)
			),
			'conditions' => array(
				'EventTeam.id' => $id
			)
		));

		$this->set('team', $team);
		$this->set('teams',  $this->Event->EventTeam->find('list', array('fields' => array('EventTeam.name'), 'conditions' => array('event_id' => $this->Session->read('state.leagueID')))));
		$this->set('details', $this->EventTeam->getTeamMatches($id, $this->Session->read('state')));
	}
}