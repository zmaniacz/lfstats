<?php

App::uses('AppController', 'Controller');
/**
 * Events Controller.
 *
 * @property Event              $Event
 * @property PaginatorComponent $Paginator
 */
class EventsController extends AppController
{
    /**
     * Components.
     *
     * @var array
     */
    public $components = ['Paginator'];

    public function beforeFilter()
    {
        $this->Auth->allow('recent', 'index', 'view', 'socialEvents');
        parent::beforeFilter();
    }

    public function recent()
    {
        $this->set('events', $this->Event->getEventList(null, 10, null));
        $this->set('_serialize', ['events']);
    }

    /**
     * index method.
     *
     * @return void
     */
    public function index()
    {
        $this->Event->recursive = 0;
        $this->set('events', $this->Paginator->paginate());
    }

    /**
     * view method.
     *
     * @param string $id
     *
     * @throws NotFoundException
     *
     * @return void
     */
    public function view($id = null)
    {
        if (!$this->Event->exists($id)) {
            throw new NotFoundException(__('Invalid event'));
        }
        $options = ['conditions' => ['Event.'.$this->Event->primaryKey => $id]];
        $this->set('event', $this->Event->find('first', $options));
    }

    /**
     * add method.
     *
     * @return void
     */
    public function add()
    {
        if ($this->request->is('post')) {
            $this->Event->create();
            if ($this->Event->save($this->request->data)) {
                $this->Flash->success(__('The event has been saved.'));

                return $this->redirect(['action' => 'index']);
            }
            $this->Flash->error(__('The event could not be saved. Please, try again.'));
        }
        $centers = $this->Event->Center->find('list');
        $this->set(compact('centers'));
    }

    public function ajaxAdd()
    {
        $this->autoRender = false;

        if ($this->request->is('post')) {
            $this->response->type('json');
            $this->Event->create();
            if ($this->Event->save($this->request->data)) {
                $response = ['status' => 'success', 'id' => $this->Event->id];
            } else {
                $response = ['status' => 'failure'];
            }

            $this->response->body(json_encode($response));
        }
    }

    /**
     * edit method.
     *
     * @param string $id
     *
     * @throws NotFoundException
     *
     * @return void
     */
    public function edit($id = null)
    {
        if (!$this->Event->exists($id)) {
            throw new NotFoundException(__('Invalid event'));
        }
        if ($this->request->is(['post', 'put'])) {
            if ($this->Event->save($this->request->data)) {
                $this->Flash->success(__('The event has been saved.'));

                return $this->redirect(['controller' => 'leagues', 'action' => 'standings', '?' => $this->request->query]);
            }
            $this->Flash->error(__('The event could not be saved. Please, try again.'));
        } else {
            $options = ['conditions' => ['Event.'.$this->Event->primaryKey => $id]];
            $this->request->data = $this->Event->find('first', $options);
        }
        $centers = $this->Event->Center->find('list');
        $this->set(compact('centers'));
    }

    /**
     * delete method.
     *
     * @param string $id
     *
     * @throws NotFoundException
     *
     * @return void
     */
    public function delete($id = null)
    {
        $this->Event->id = $id;
        if (!$this->Event->exists()) {
            throw new NotFoundException(__('Invalid event'));
        }
        $this->request->allowMethod('post', 'delete');
        if ($this->Event->delete()) {
            $this->Flash->success(__('The event has been deleted.'));
        } else {
            $this->Flash->error(__('The event could not be deleted. Please, try again.'));
        }

        return $this->redirect(['action' => 'index']);
    }

    public function socialEvents()
    {
        $this->set('events', $this->Event->getEventList('social', null, $this->Session->read('state.centerID')));
        $this->set('_serialize', ['events']);
    }

    public function getEvent($id = null)
    {
        if (!$this->Event->exists($id)) {
            throw new NotFoundException(__('Invalid event'));
        }
        $options = ['conditions' => ['Event.'.$this->Event->primaryKey => $id]];
        $this->set('event', $this->Event->find('first', $options));
        $this->set('_serialize', ['event']);
    }
}
