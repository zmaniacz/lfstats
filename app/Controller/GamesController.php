<?php

App::uses('AppController', 'Controller');
/**
 * Games Controller.
 *
 * @property Game               $Game
 * @property PaginatorComponent $Paginator
 * @property SessionComponent   $Session
 */
class GamesController extends AppController
{
    /**
     * Components.
     *
     * @var array
     */
    public $components = ['Paginator', 'Session'];

    public $uses = ['Game', 'Player'];

    public function beforeFilter()
    {
        $this->Auth->allow('index', 'view', 'overall', 'overallWinLossDetail', 'getGameList', 'getGameMatchups', 'scoreChart', 'actionList');
        parent::beforeFilter();
    }

    /**
     * index method.
     *
     * @return void
     */
    public function index()
    {
        $this->set('games', $this->Game->getGameList(null, $this->Session->read('state')));
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
        if (!$this->Game->exists($id)) {
            throw new NotFoundException(__('Invalid game'));
        }

        if ($this->request->is(['post', 'put'])) {
            if ($this->Game->save($this->request->data)) {
                if (!empty($this->request->data['Game']['match'])) {
                    $this->loadModel('Match');
                    $match = explode('|', $this->request->data['Game']['match']);
                    $this->Match->addGame($match[0], $match[1], $this->request->data['Game']['id']);
                }

                $this->Flash->success('The game has been saved.');

                return $this->redirect(['action' => 'view', $id, '?' => $this->request->query]);
            }
            $this->Flash->error('The game could not be saved. Please, try again.');
        } else {
            $this->loadModel('Event');

            $game = $this->Game->find('first', [
                'contain' => [
                    'Match' => [
                        'Round',
                    ],
                    'Scorecard' => [
                        'Penalty',
                    ],
                    'Red_TeamPenalties',
                    'Green_TeamPenalties',
                ],
                'conditions' => ['Game.id' => $id],
            ]);
            $this->request->data = $game;

            foreach ($game['Scorecard'] as $key => $row) {
                $team[$key] = $row['team'];
                $score[$key] = $row['score'];
            }

            if (!empty($team)) {
                if ('red' == $game['Game']['winner']) {
                    array_multisort($team, SORT_DESC, $score, SORT_DESC, $game['Scorecard']);
                } else {
                    array_multisort($team, SORT_ASC, $score, SORT_DESC, $game['Scorecard']);
                }
            }

            if ('league' == $game['Game']['type'] || 'tournament' == $game['Game']['type']) {
                $this->loadModel('LeagueGame');
                $this->set('teams', $this->Event->getTeams($game['Game']['event_id']));
                $this->set('available_matches', $this->Event->getAvailableMatches($game));
            }

            $this->set('neighbors', $this->Game->getPrevNextGame($game['Game']['id']));
            $this->set('game', $game);
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
        if (!$this->Game->exists($id)) {
            throw new NotFoundException(__('Invalid game'));
        }
        if ($this->request->is(['post', 'put'])) {
            if ($this->Game->save($this->request->data)) {
                $this->Session->setFlash(__('The game has been saved.'));

                return $this->redirect(['action' => 'view', $id, '?' => $this->request->query]);
            }
            $this->Session->setFlash(__('The game could not be saved. Please, try again.'));
        } else {
            $this->loadModel('Event');

            $options = ['conditions' => ['Game.' . $this->Game->primaryKey => $id]];
            $this->request->data = $this->Game->find('first', $options);
            if ('league' == $this->request->data['Game']['type'] || 'tournament' == $this->request->data['Game']['type']) {
                $this->set('teams', $this->Event->getTeams($this->request->data['Game']['event_id']));
            }
        }
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
        $this->Game->id = $id;
        if (!$this->Game->exists()) {
            throw new NotFoundException(__('Invalid game'));
        }

        if ($this->Game->delete()) {
            $this->Session->setFlash(__('The game has been deleted.'));
        } else {
            $this->Session->setFlash(__('The game could not be deleted. Please, try again.'));
        }

        return $this->redirect(['controller' => 'Games', 'action' => 'index', '?' => $this->request->query]);
    }

    public function overall()
    {
    }

    public function queue()
    {
    }

    public function getGameList()
    {
        $date = (empty($this->request->query('date'))) ? null : $this->request->query('date');
        $this->set('data', $this->Game->getGameList($date, $this->Session->read('state')));
    }

    public function overallWinLossDetail()
    {
        $this->set('overall', $this->Game->getOverallStats($this->Session->read('state')));
        $this->set('overall_averages', $this->Game->Scorecard->getOverallAverages($this->Session->read('state')));
    }

    public function scoreChart($id = null)
    {
        $this->Game->id = $id;
        if (!$this->Game->exists()) {
            throw new NotFoundException(__('Invalid game'));
        }

        $this->set('data', $this->Game->getGameScoreChartData($id));
        $this->set('_serialize', ['data']);
    }

    public function actionList($id = null)
    {
        $this->Game->id = $id;
        if (!$this->Game->exists()) {
            throw new NotFoundException(__('Invalid game'));
        }

        $this->set('data', $this->Game->getGameActionList($id));
        $this->set('_serialize', ['data']);
    }
}
