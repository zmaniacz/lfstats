<?php

/**
 * Application level Controller.
 *
 * This file is application-wide controller file. You can put all
 * application-wide controller-related methods here.
 *
 * PHP 5
 *
 * CakePHP(tm) : Rapid Development Framework (http://cakephp.org)
 * Copyright (c) Cake Software Foundation, Inc. (http://cakefoundation.org)
 *
 * Licensed under The MIT License
 * For full copyright and license information, please see the LICENSE.txt
 * Redistributions of files must retain the above copyright notice.
 *
 * @copyright     Copyright (c) Cake Software Foundation, Inc. (http://cakefoundation.org)
 *
 * @see          http://cakephp.org CakePHP(tm) Project
 * @since         CakePHP(tm) v 0.2.9
 *
 * @license       http://www.opensource.org/licenses/mit-license.php MIT License
 */
App::uses('Controller', 'Controller');

/**
 * Application Controller.
 *
 * Add your application-wide methods in the class below, your controllers
 * will inherit them.
 *
 * @see		http://book.cakephp.org/2.0/en/controllers.html#the-app-controller
 */
class AppController extends Controller
{
    public $helpers = [
        'Html' => [
            'className' => 'HtmlExt',
        ],
    ];

    /**
     * List of global controller components.
     *
     * @var array
     */
    public $components = [
        'RequestHandler',
        'Session',
        'Flash',
        'Auth' => [
            'logoutRedirect' => [
                'controller' => 'scorecards',
                'action' => 'index',
                'home',
            ],
            'authorize' => ['Controller'],
        ],
        'DebugKit.Toolbar',
    ];

    public $uses = ['Center', 'Event', 'Scorecard', 'Game'];

    public function isAuthorized($user)
    {
        if (isset($user['role']) && 'admin' === $user['role']) {
            return true;
        }
        if (isset($user['role']) && 'center_admin' === $user['role'] && $user['center'] == $this->Session->read('state.centerID')) {
            return true;
        }

        return false;
    }

    public function beforeFilter()
    {
        //read state from the querystring; default to social games at LTC if no state passed
        if (!is_null($this->request->query('gametype'))) {
            $this->Session->write('state.gametype', $this->request->query('gametype'));
        } elseif (!$this->Session->check('state.gametype')) {
            $this->Session->write('state.gametype', 'social');
        }

        if (!is_null($this->request->query('centerID'))) {
            $this->Session->write('state.centerID', $this->request->query('centerID'));
        } elseif (!$this->Session->check('state.centerID')) {
            $this->Session->write('state.centerID', 14);
        }

        if (!is_null($this->request->query('leagueID'))) {
            $this->Session->write('state.leagueID', $this->request->query('leagueID'));
        } elseif (!$this->Session->check('state.leagueID')) {
            $this->Session->write('state.leagueID', 0);
        }

        if (!is_null($this->request->query('isComp'))) {
            $this->Session->write('state.isComp', $this->request->query('isComp'));
        } elseif (!$this->Session->check('state.isComp')) {
            $this->Session->write('state.isComp', 0);
        }

        if (!is_null($this->request->query('show_rounds'))) {
            $this->Session->write('state.show_rounds', $this->request->query('show_rounds'));
        } elseif (!$this->Session->check('state.show_rounds')) {
            $this->Session->write('state.show_rounds', 'true');
        }

        if (!is_null($this->request->query('show_finals'))) {
            $this->Session->write('state.show_finals', $this->request->query('show_finals'));
        } elseif (!$this->Session->check('state.show_finals')) {
            $this->Session->write('state.show_finals', 'false');
        }

        if (!is_null($this->request->query('show_subs'))) {
            $this->Session->write('state.show_subs', $this->request->query('show_subs'));
        } elseif (!$this->Session->check('state.show_subs')) {
            $this->Session->write('state.show_subs', 'false');
        }

        //get a center and league object for use throughout the app
        if (('all' == $this->Session->read('state.gametype') || 'social' == $this->Session->read('state.gametype')) && $this->Session->read('state.centerID') > 0) {
            $this->set('selected_center', $this->Center->findById($this->Session->read('state.centerID')));
        } elseif ('league' == $this->Session->read('state.gametype') && $this->Session->read('state.leagueID') > 0) {
            $event = $this->Event->find('first', [
                'contain' => [
                    'Center',
                ],
                'conditions' => [
                    'Event.id' => $this->Session->read('state.leagueID'),
                ],
            ]);

            if ($event['Event']['is_comp']) {
                $this->set('selected_league', $event);
                $this->set('selected_center', $this->Center->findById($event['Center']['id']));
                $this->Session->write('state.centerID', $event['Center']['id']);
                $this->Session->write('state.isComp', $event['Event']['is_comp']);
                $this->Session->write('state.scoring', $event['Event']['scoring']);
            } else {
                $this->Session->write('state.leagueID', 0);
                $this->Session->write('state.isComp', $event['Event']['is_comp']);
            }
        }

        $this->set('centers', $this->Center->find('list'));
        $this->set('leagues', $this->Event->getLeagueList());
        $this->set('league_details', $this->Event->getLeagueDetailList());
        //$this->set('scorecard_stats', $this->Scorecard->getDatabaseStats());
        //$this->set('game_stats', $this->Game->getDatabaseStats());
    }
}
