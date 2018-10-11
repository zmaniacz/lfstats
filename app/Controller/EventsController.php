<?php
App::uses('AppController', 'Controller');

class EventsController extends AppController {
    public function beforeFilter() {
		$this->Auth->allow();
		parent::beforeFilter();
	}

	public function recent() {
        $this->set('events', $this->Event->getEventList(null, 10, null));
        $this->set('_serialize', array('events'));
	}
}
