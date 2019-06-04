<?php
App::uses('AppController', 'Controller');

class TeamsController extends AppController
{
    public $uses = array('EventTeam','MatchPenalty');
    
    public function beforeFilter()
    {
        $this->Auth->allow('view', 'getMatchPenalties', 'getTeamDetails');
        parent::beforeFilter();
    }
    
    public function view($id = null)
    {
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
        $this->set('teams', $this->Event->EventTeam->find('list', array('fields' => array('EventTeam.name'), 'conditions' => array('event_id' => $this->Session->read('state.leagueID')))));
        $this->set('details', $this->EventTeam->getTeamMatches($id, $this->Session->read('state')));
    }

    public function getTeamDetails($id)
    {
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

        $this->set('data', $team);
    }

    public function setName()
    {
        $team = $this->EventTeam->read(null, $this->request->data["team-id"]);
        $this->EventTeam->set('name', $this->request->data["team-name"]);
        
        if ($this->EventTeam->save()) {
            $response = array('body' => 'success');
        } else {
            $response = array('body' => 'failure');
        }
        
        return new CakeResponse($response);
    }

    public function addMatchPenalty()
    {
        $this->MatchPenalty->create();

        $this->MatchPenalty->set('type', $this->request->data["match-penalty-type"]);
        $this->MatchPenalty->set('description', $this->request->data["match-penalty-description"]);
        $this->MatchPenalty->set('value', $this->request->data["match-penalty-value"]);
        $this->MatchPenalty->set('team_id', $this->request->data["match-penalty-team-id"]);
        
        if ($this->MatchPenalty->save()) {
            $response = array('body' => 'success');
        } else {
            $response = array('body' => 'failure');
        }
        
        return new CakeResponse($response);
    }
    
    public function deleteMatchPenalty($id)
    {
        if ($this->MatchPenalty->delete($id)) {
            $response = array('body' => 'success');
        } else {
            $response = array('body' => 'failure');
        }
        
        return new CakeResponse($response);
    }
    
    public function editMatchPenalty($id)
    {
        $this->MatchPenalty->create();

        $this->MatchPenalty->set('type', $this->request->data["match-penalty-type"]);
        $this->MatchPenalty->set('description', $this->request->data["match-penalty-description"]);
        $this->MatchPenalty->set('value', $this->request->data["match-penalty-value"]);
        $this->MatchPenalty->set('team_id', $this->request->data["match-penalty-team-id"]);
        
        if ($this->MatchPenalty->save()) {
            $response = array('body' => 'success');
        } else {
            $response = array('body' => 'failure');
        }
        
        return new CakeResponse($response);
    }
    
    public function getMatchPenalties($team_id)
    {
        $team = $this->EventTeam->find('first', array(
            'contain' => array(
                'MatchPenalty'
            ),
            'conditions' => array(
                'id' => $team_id
            )
        ));

        $this->set('data', $team['MatchPenalty']);
        $this->set('_serialize', array('data'));
    }
}