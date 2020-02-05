<?php

App::uses('AppController', 'Controller');

class PenaltiesController extends AppController
{
    /**
     * Components.
     *
     * @var array
     */
    public $components = ['Flash', 'Session'];

    public function beforeFilter()
    {
        $this->Auth->allow('index', 'view', 'getPenalty', 'getPenaltyBreakdown');
        parent::beforeFilter();
    }

    /**
     * index method.
     *
     * @return void
     */
    public function index()
    {
        $this->set('penalties', $this->Penalty->getPenalties($this->Session->read('state')));
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
        if (!$this->Penalty->exists($id)) {
            throw new NotFoundException(__('Invalid penalty'));
        }
        $options = ['conditions' => ['Penalty.'.$this->Penalty->primaryKey => $id]];
        $this->Penalty->contain([
            'Scorecard' => [
                'fields' => [],
                'Game' => [
                    'fields' => ['id', 'game_name', 'game_description', 'game_datetime'],
                ],
                'Player' => [
                    'fields' => ['id', 'player_name'],
                ],
            ],
        ]);
        $this->set('penalty', $this->Penalty->find('first', $options));
    }

    /**
     * add method.
     *
     * @param mixed $scorecard_id
     *
     * @return void
     */
    public function add($scorecard_id)
    {
        if (!$this->Penalty->Scorecard->exists($scorecard_id)) {
            throw new NotFoundException(__('Invalid scorecard'));
        }
        if ($this->request->is('post')) {
            $this->Penalty->create();
            if ($this->Penalty->save($this->request->data)) {
                $this->Flash->success('The penalty has been saved.');

                $scorecard = $this->Penalty->Scorecard->find('first', [
                    'contain' => [
                        'Game' => [
                            'Match',
                        ],
                    ],
                    'conditions' => ['Scorecard.id' => $this->request->data['Penalty']['scorecard_id']],
                ]);

                //add a penalty to the scorecard record and recalc MVP
                ++$scorecard['Scorecard']['penalties'];
                $this->Penalty->Scorecard->save($scorecard);
                $this->Penalty->Scorecard->generateMVP($scorecard['Scorecard']['game_id']);

                $this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);

                return $this->redirect(['controller' => 'Games', 'action' => 'view', $scorecard['Scorecard']['game_id'], '?' => $this->request->query]]);
            }
            $this->Flash->error('The penalty could not be saved. Please, try again.');
        }

        $scorecards = $this->Penalty->Scorecard->find('list', ['conditions' => ['Scorecard.id' => $scorecard_id]]);
        $this->set(compact('scorecards'));
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
        if (!$this->Penalty->exists($id)) {
            throw new NotFoundException(__('Invalid penalty'));
        }

        if ($this->request->is(['post', 'put'])) {
            $penalty = $this->Penalty->findById($id);
            $scorecard = $this->Penalty->Scorecard->find('first', [
                'contain' => [
                    'Game' => [
                        'Match',
                    ],
                ],
                'conditions' => ['Scorecard.id' => $penalty['Penalty']['scorecard_id']],
            ]);

            if ($this->Penalty->save($this->request->data)) {
                $this->Penalty->Scorecard->save($scorecard);
                $this->Penalty->Scorecard->generateMVP($scorecard['Scorecard']['game_id']);

                $this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);

                $this->Flash->success('The penalty has been saved.');
                $this->redirect(['controller' => 'Games', 'action' => 'view', $scorecard['Scorecard']['game_id'], '?' => $this->request->query]]);
            } else {
                $this->Flash->error('The penalty could not be saved. Please, try again.');
            }
        } else {
            $options = ['conditions' => ['Penalty.'.$this->Penalty->primaryKey => $id]];
            $this->request->data = $this->Penalty->find('first', $options);
        }

        $scorecards = $this->Penalty->Scorecard->find('list');
        $this->set(compact('scorecards'));
    }

    public function rescind($id = null)
    {
        if (!$this->Penalty->exists($id)) {
            throw new NotFoundException(__('Invalid penalty'));
        }

        $penalty = $this->Penalty->findById($id);
        $scorecard = $this->Penalty->Scorecard->find('first', [
            'contain' => [
                'Game' => [
                    'Match',
                ],
            ],
            'conditions' => ['Scorecard.id' => $penalty['Penalty']['scorecard_id']],
        ]);

        $penalty['Penalty']['type'] = 'Penalty Removed';
        $penalty['Penalty']['value'] = 0;
        $penalty['Penalty']['mvp_value'] = 0;
        $penalty['Penalty']['rescinded'] = 1;

        if ($this->Penalty->save($penalty)) {
            $this->Penalty->Scorecard->save($scorecard);
            $this->Penalty->Scorecard->generateMVP($scorecard['Scorecard']['game_id']);

            $this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);

            $this->Flash->success('The penalty has been rescinded.');
        } else {
            $this->Flash->error('The penalty could not be saved. Please, try again.');
        }

        $this->redirect($this->referer());
    }

    public function common($id = null)
    {
        if (!$this->Penalty->exists($id)) {
            throw new NotFoundException(__('Invalid penalty'));
        }

        $penalty = $this->Penalty->findById($id);
        $scorecard = $this->Penalty->Scorecard->find('first', [
            'contain' => [
                'Game' => [
                    'Match',
                ],
            ],
            'conditions' => ['Scorecard.id' => $penalty['Penalty']['scorecard_id']],
        ]);

        $penalty['Penalty']['type'] = 'Common Foul';
        $penalty['Penalty']['value'] = 0;
        $penalty['Penalty']['mvp_value'] = 0;

        if ($this->Penalty->save($penalty)) {
            $this->Penalty->Scorecard->save($scorecard);
            $this->Penalty->Scorecard->generateMVP($scorecard['Scorecard']['game_id']);

            $this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);

            $this->Flash->success('The penalty has been marked common.');
        } else {
            $this->Flash->error('The penalty could not be saved. Please, try again.');
        }

        $this->redirect($this->referer());
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
        $this->Penalty->id = $id;
        if (!$this->Penalty->exists()) {
            throw new NotFoundException(__('Invalid penalty'));
        }

        $penalty = $this->Penalty->findById($id);
        $scorecard = $this->Penalty->Scorecard->find('first', [
            'contain' => [
                'Game' => [
                    'Match',
                ],
            ],
            'conditions' => ['Scorecard.id' => $penalty['Penalty']['scorecard_id']],
        ]);

        if ($this->Penalty->delete()) {
            $this->Flash->success('The penalty has been deleted.');

            //remove a penalty to the socrecard record and recalc MVP
            --$scorecard['Scorecard']['penalties'];
            if ($scorecard['Scorecard']['penalties'] < 0) {
                $scorecard['Scorecard']['penalties'] = 0;
            }

            $scorecard['Scorecard']['mvp_points'] = null;
            $this->Penalty->Scorecard->save($scorecard);
            $this->Penalty->Scorecard->generateMVP($scorecard['Scorecard']['game_id']);
        } else {
            $this->Flash->error('The penalty could not be deleted. Please, try again.');
        }

        $this->Penalty->Scorecard->Game->updateGameWinner($scorecard['Scorecard']['game_id']);

        $this->redirect($this->referer());
    }

    public function getPenalty($id)
    {
        $this->request->allowMethod('ajax');
        $options = ['conditions' => ['Penalty.'.$this->Penalty->primaryKey => $id]];
        $this->Penalty->contain([
            'Scorecard' => [
                'fields' => [],
                'Game' => [
                    'fields' => ['id', 'game_name', 'game_description', 'game_datetime', 'center_id'],
                ],
                'Player' => [
                    'fields' => ['id', 'player_name'],
                ],
            ],
        ]);
        $this->set('penalty', $this->Penalty->find('first', $options));
    }

    public function getPenaltyBreakdown($scorecard_id)
    {
        $this->set('penalties', $this->Penalty->find('all', [
            'contain' => [
                'Scorecard',
            ],
            'conditions' => ['Penalty.scorecard_id' => $scorecard_id],
        ]));
    }
}
