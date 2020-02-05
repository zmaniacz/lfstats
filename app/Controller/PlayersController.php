<?php

class PlayersController extends AppController
{
    public $components = ['RequestHandler'];

    public function beforeFilter()
    {
        $this->Auth->allow('index', 'view', 'playerWinLossDetail', 'getPlayerMedians');
        parent::beforeFilter();
    }

    public function index()
    {
        $this->redirect(['controller' => 'scorecards', 'action' => 'overall', '?' => $this->request->query]]);
    }

    public function view($id = null)
    {
        if (null == $id || $id <= 0) {
            $this->redirect(['controller' => 'Players', 'action' => 'index', '?' => $this->request->query]]);
        } else {
            $this->set('id', $id);
            $this->set('player', $this->Player->findById($id));
            $this->set('aliases', $this->Player->PlayersName->findAllByPlayerId($id));
            $this->set('overall', $this->Player->getPlayerStats($id, null, $this->Session->read('state')));
            $this->set('commander', $this->Player->getPlayerStats($id, 'Commander', $this->Session->read('state')));
            $this->set('heavy', $this->Player->getPlayerStats($id, 'Heavy Weapons', $this->Session->read('state')));
            $this->set('scout', $this->Player->getPlayerStats($id, 'Scout', $this->Session->read('state')));
            $this->set('ammo', $this->Player->getPlayerStats($id, 'Ammo Carrier', $this->Session->read('state')));
            $this->set('medic', $this->Player->getPlayerStats($id, 'Medic', $this->Session->read('state')));
            //$this->set('games', $this->Player->Scorecard->getPlayerGamesScorecardsById($id, $this->Session->read('state')));
            //$this->set('teammates',$this->Player->getMyTeammates($id, $this->Session->read('state')));
        }
    }

    public function link($id = null)
    {
        if ($this->request->is('Post')) {
            $target_player = $this->Player->findById($id);
            $master_player = $this->Player->findById($this->request->data['Player']['linked_id']);

            $this->Player->linkPlayers($this->request->data['Player']['linked_id'], $id);

            $this->Session->setFlash(__($target_player['Player']['player_name'].' has been set as an alias of '.$master_player['Player']['player_name']));

            return $this->redirect(['action' => 'view', $this->request->data['Player']['linked_id'], '?' => $this->request->query]]);
        }

        if (isset($id)) {
            $this->set('players', $this->Player->find('list', ['conditions' => ['ipl_id IS NOT NULL'], 'order' => 'player_name ASC']));
            $this->set('target_player', $this->Player->findById($id));
        } else {
            $this->set('links', $this->Player->findLinks());
        }
    }

    public function linkPlayers($master_id, $target_id)
    {
        $target_player = $this->Player->findById($target_id);
        $master_player = $this->Player->findById($master_id);

        $this->Player->linkPlayers($master_id, $target_id);

        $this->Session->setFlash(__($target_player['Player']['player_name'].' has been set as an alias of '.$master_player['Player']['player_name']));

        return $this->redirect(['action' => 'view', $master_id, '?' => $this->request->query]]);
    }

    public function playerWinLossDetail($id)
    {
        $this->set('games', $this->Player->Scorecard->getPlayerGamesScorecardsById($id, $this->Session->read('state')));
    }

    public function getPlayerMedians()
    {
        $player_id = (empty($this->request->query('player_id'))) ? null : $this->request->query('player_id');
        $team = (empty($this->request->query('team'))) ? null : $this->request->query('team');
        $type = (empty($this->request->query('type'))) ? 'mvp_points' : $this->request->query('type');
        $this->set('data', $this->Player->getMedianByPosition($player_id, $team, $type, $this->Session->read('state')));
    }
}
