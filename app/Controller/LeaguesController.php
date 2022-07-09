<?php

App::uses('AppController', 'Controller');

class LeaguesController extends AppController
{
    public $uses = ['Event', 'Scorecard', 'Game', 'Player', 'EventPlayer'];

    public function beforeFilter()
    {
        $this->Auth->allow('index', 'standings', 'soloStandings', 'soloWinsStandings', 'ajax_getLeagues', 'ajax_getTeams', 'ajax_getMatchDetails', 'ajax_getTeamStandings', 'bracket', 'getSoloStandings', 'getSoloWinStandings');
        parent::beforeFilter();
    }

    /**
     * index method.
     *
     * @return void
     */
    public function index()
    {
        $this->redirect(['controller' => 'leagues', 'action' => 'standings', '?' => $this->request->query]);
    }

    public function standings()
    {
        if ($this->Session->read('state.isComp') < 1) {
            $this->redirect(['controller' => 'scorecards', 'action' => 'landing', '?' => $this->request->query]);
        }

        $event = $this->Event->findById($this->Session->read('state.leagueID'));

        if ('solo' == $event['Event']['scoring']) {
            $this->redirect(['controller' => 'leagues', 'action' => 'soloStandings', '?' => $this->request->query]);
        }

        if ('solo_wins' == $event['Event']['scoring']) {
            $this->redirect(['controller' => 'leagues', 'action' => 'soloWinsStandings', '?' => $this->request->query]);
        }

        $this->set('teams', $this->Event->EventTeam->find('list', ['fields' => ['EventTeam.name'], 'conditions' => ['event_id' => $this->Session->read('state.leagueID')]]));
        $this->set('details', $this->Event->getLeagueDetails($this->Session->read('state')));
    }

    public function soloStandings()
    {
        $date = (empty($this->request->query('date'))) ? null : $this->request->query('date');
        $game_dates = $this->Scorecard->getGameDates($this->Session->read('state'));
        $this->set('game_dates', $game_dates);

        if ($this->request->isPost()) {
            $date = $this->request->data['Scorecard']['date'];
        }

        if (empty($date)) {
            $date = reset($game_dates);
        }

        $this->set('current_date', $date);
    }

    public function soloWinsStandings()
    {
        $date = (empty($this->request->query('date'))) ? null : $this->request->query('date');
        $game_dates = $this->Scorecard->getGameDates($this->Session->read('state'));
        $this->set('game_dates', $game_dates);

        if ($this->request->isPost()) {
            $date = $this->request->data['Scorecard']['date'];
        }

        if (empty($date)) {
            $date = reset($game_dates);
        }

        $this->set('current_date', $date);
    }

    public function bracket()
    {
        $this->set('teams', $this->Event->EventTeam->find('list', ['fields' => ['EventTeam.name'], 'conditions' => ['event_id' => $this->Session->read('state.leagueID')]]));
        $this->set('details', $this->Event->getLeagueDetails($this->Session->read('state')));
    }

    public function ajax_getTeamStandings($round = null)
    {
        $this->set('data', $this->Event->getTeamStandings($this->Session->read('state'), $round));
    }

    public function ajax_getLeagues()
    {
        $this->request->onlyAllow('ajax');
        $this->set('leagues', $this->Event->getLeagues());
    }

    public function ajax_getTeams()
    {
        $this->request->onlyAllow('ajax');
        $this->set('teams', $this->Event->getTeamStandings($this->Session->read('state')));
    }

    public function ajax_getStandings()
    {
        $this->request->onlyAllow('ajax');
        $this->set('standings', $this->Event->getTeamStandings($this->Session->read('state')));
    }

    public function ajax_assignTeam($match_id, $team_number, $team_id)
    {
        $this->request->onlyAllow('ajax');

        $match = $this->Event->Round->Match->read(null, $match_id);

        if (1 == $team_number) {
            $this->Event->Round->Match->set('team_1_id', $team_id);
        } else {
            $this->Event->Round->Match->set('team_2_id', $team_id);
        }

        if ($this->Event->Round->Match->save()) {
            return new CakeResponse(['body' => json_encode(['match_id' => $match_id, 'team_number' => $team_number, 'team_id' => $team_id])]);
        }
    }

    public function getEventDetails($id)
    {
        $this->set('event', $this->Event->findById($id));
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
                return $this->flash(__('The event has been saved.'), ['controller' => 'leagues', 'action' => 'standings']);
            }
        }
        $centers = $this->Event->Center->find('list');
        $this->set(compact('centers'));
    }

    public function addTeam()
    {
        if ($this->request->is('post')) {
            $this->Event->EventTeam->create();
            if ($this->Event->EventTeam->save($this->request->data)) {
                $this->Session->setFlash(__('The team has been saved.'));
                $this->redirect(['controller' => 'leagues', 'action' => 'standings', '?' => $this->request->query]);
            }
        }
    }

    public function eligiblePlayers($eventId = null)
    {
        if (!$this->Event->exists($eventId)) {
            throw new NotFoundException(__('Invalid event'));
        }

        $this->set('players', $this->Player->getEligiblePlayers($eventId));
        $this->set('_serialize', ['players']);
    }

    public function addPlayer($eventId = null)
    {
        if ($this->request->is('post')) {
            if (!$this->Event->exists($eventId)) {
                throw new NotFoundException(__('Invalid event'));
            }

            $this->Event->EventPlayer->create();
            $this->Event->EventPlayer->set(['player_id' => $this->request->data['player-name'], 'event_id' => $eventId]);
            if ($this->Event->EventPlayer->save()) {
                $response = ['body' => 'success'];
            } else {
                $response = ['body' => 'failure'];
            }

            return new CakeResponse($response);
        }
    }

    public function getSoloStandings($eventId = null)
    {
        if (!$this->Event->exists($eventId)) {
            throw new NotFoundException(__('Invalid event'));
        }

        $this->set('data', $this->Event->getSoloStandings($eventId));
        $this->set('_serialize', ['data']);
    }

    public function getSoloWinStandings($eventId = null)
    {
        if (!$this->Event->exists($eventId)) {
            throw new NotFoundException(__('Invalid event'));
        }

        $this->set('data', $this->Event->getSoloWinStandings($eventId));
        $this->set('_serialize', ['data']);
    }

    public function setHandicap()
    {
        $this->EventPlayer->read(null, $this->request->data['event-player-id']);
        $this->EventPlayer->set('handicap', $this->request->data['player-handicap']);

        if ($this->EventPlayer->save()) {
            $response = ['body' => 'success'];
        } else {
            $response = ['body' => 'failure'];
        }

        return new CakeResponse($response);
    }

    public function addRound()
    {
        if ($this->request->is('post')) {
            $this->Event->Round->create();
            if ($this->Event->Round->save($this->request->data)) {
                $this->Session->setFlash(__('The round has been created.'));
                $this->redirect(['controller' => 'leagues', 'action' => 'standings', '?' => $this->request->query]);
            }
        }
    }

    public function addMatch($league_id, $round_id)
    {
        if ($this->request->is('post')) {
            $match = $this->Event->Round->Match->find('first', [
                'conditions' => [
                    'round_id' => $this->request->data['Event']['round_id'],
                ],
                'order' => 'match DESC',
            ]);
            $match_start = ($match) ? $match['Match']['match'] : 0;

            for ($i = 0; $i < $this->request->data['Event']['matches']; ++$i) {
                ++$match_start;
                $this->Event->Round->Match->create();
                $this->Event->Round->Match->set('match', $match_start);
                $this->Event->Round->Match->set('round_id', $this->request->data['Event']['round_id']);
                $this->Event->Round->Match->save();
            }

            $this->redirect(['controller' => 'leagues', 'action' => 'standings', '?' => $this->request->query]);
        } else {
            $this->set('league', $this->Event->findById($league_id));
            $this->set('round', $this->Event->Round->findById($round_id));
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
                return $this->flash(__('The event has been saved.'), ['action' => 'index']);
            }
        } else {
            $options = ['conditions' => ['Event.' . $this->Event->primaryKey => $id]];
            $this->request->data = $this->Event->find('first', $options);
        }
        $centers = $this->Event->Center->find('list');
        $this->set(compact('centers'));
    }

    public function editMatch($id = null)
    {
        if (!$this->Event->Round->Match->exists($id)) {
            throw new NotFoundException(__('Invalid match'));
        }
        if ($this->request->is(['post', 'put'])) {
            if ($this->Event->Round->Match->save($this->request->data)) {
                $this->Session->setFlash(__('Match saved'));
                $this->redirect(['controller' => 'leagues', 'action' => 'standings', '?' => $this->request->query]);
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
        $this->Event->id = $id;
        if (!$this->Event->exists()) {
            throw new NotFoundException(__('Invalid event'));
        }
        $this->request->allowMethod('post', 'delete');
        if ($this->Event->delete()) {
            return $this->flash(__('The event has been deleted.'), ['action' => 'index']);
        }

        return $this->flash(__('The event could not be deleted. Please, try again.'), ['action' => 'index']);
    }
}
