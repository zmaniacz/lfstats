<?php

App::uses('AppController', 'Controller', 'Xml', 'Utility');

class UploadsController extends AppController
{
    public $uses = ['Scorecard', 'Game', 'Event'];

    public function index()
    {
        $this->set('social_events', $this->Event->getEventList('social', null, $this->Session->read('state.centerID')));
    }

    public function uploadTdf()
    {
        $this->set('social_events', $this->Event->getEventList('social', null, $this->Session->read('state.centerID')));
    }

    public function viewImports()
    {
    }

    public function handleUploads($type = 'PDF')
    {
        if ('PDF' == $type) {
            App::import('Vendor', 'UploadHandler', ['file' => 'UploadHandler/UploadHandler.php']);
            $options = [
                'script_url' => FULL_BASE_URL.DS.'uploads/handleUploads/',
                'upload_dir' => 'parser'.DS.'incoming'.DS.$this->Session->read('state.centerID').DS,
                'upload_url' => FULL_BASE_URL.DS.'parser'.DS.'incoming'.DS.$this->Session->read('state.centerID').DS,
                'delete_type' => 'POST',
                'accept_file_types' => '/\.(pdf)$/i',
                'print_response' => false,
                'image_versions' => [],
            ];
        } elseif ('TDF' == $type) {
            App::import('Vendor', 'UploadHandler', ['file' => 'UploadHandler/UploadHandlerS3.php']);
            $options = [
                'script_url' => FULL_BASE_URL.DS.'uploads/handleUploads/',
                'accept_file_types' => '/\.(tdf)$/i',
                'print_response' => false,
                'image_versions' => [],
            ];
        }

        if ($this->request->is('post')) {
            $upload_handler = new UploadHandler($options, $initialize = false);
            switch ($_SERVER['REQUEST_METHOD']) {
                case 'HEAD':
                case 'GET':
                $upload_handler->get();

                break;
                case 'POST':
                $upload_handler->post();

                break;
                case 'DELETE':
                $upload_handler->delete();

                break;
                default:
                header('HTTP/1.0 405 Method Not Allowed');
            }
        } else {
            $upload_handler = new UploadHandler($options, $initialize = true);
            switch ($_SERVER['REQUEST_METHOD']) {
                case 'HEAD':
                case 'GET':
                $upload_handler->get();

                break;
                case 'POST':
                $upload_handler->post();

                break;
                case 'DELETE':
                $upload_handler->delete();

                break;
                default:
                header('HTTP/1.0 405 Method Not Allowed');
            }
        }
        if (!$this->Session->check('state.centerID')) {
            throw new NotFoundException(__('No center defined'));
        }
    }

    public function parse()
    {
        $center_id = $this->Session->read('state.centerID');
        $command = "nohup sh -c 'parser/pdfparse.sh {$center_id}' > /dev/null 2>&1 & echo $!";
        $this->set('pid', exec($command, $output));
        $this->set('selectedEvent', (isset($this->request->data['Event']) ? $this->request->data['Event'] : 0));
    }

    public function checkPid($pid)
    {
        $cmd = "ps {$pid}";
        exec($cmd, $output, $result);
        if (count($output) >= 2) {
            $this->set('alive', true);
        } else {
            $this->set('alive', false);
        }
    }

    public function parseCSV()
    {
        //We're only going to process the most recent file
        $center_id = $this->Session->read('state.centerID');
        $type = $this->Session->read('state.gametype');
        $selectedEvent = json_decode($this->request->query['selectedEvent'], true);

        //make sure we default to social
        if ('all' == $type) {
            $type = 'social';
        }

        $event_id = null;
        if ('league' == $type || 'tournament' == $type) {
            $event_id = $this->Session->read('state.leagueID');
        } elseif ($selectedEvent['id'] > 0) {
            $event_id = $selectedEvent['id'];
        } else {
            $this->Event->create();
            $this->Event->set([
                'name' => $selectedEvent['name'],
                'type' => $type,
                'is_comp' => (('league' == $type || 'tournament' == $type) ? 1 : 0),
                'center_id' => $center_id,
            ]);
            $this->Event->save();
            $event_id = $this->Event->id;
        }

        $event = $this->Event->findById($event_id);

        $path = "parser/pending/{$center_id}";

        $latest_ctime = 0;
        $latest_filename = '';

        $d = dir($path);
        while (false !== ($entry = $d->read())) {
            $filepath = "{$path}/{$entry}";
            if (is_file($filepath) && filectime($filepath) > $latest_ctime) {
                $latest_ctime = filectime($filepath);
                $latest_filename = $entry;
            }
        }

        $row = 0;
        $xmlString = file_get_contents($path.DS.$latest_filename);
        $xml = Xml::toArray(Xml::build($xmlString));

        //jesus fuck this shit right here.  I mean really cakephp, what the goddamned fuck
        //fix your fucking xml class fuck off
        $xml['games']['game'] = isset($xml['games']['game'][0]) ? $xml['games']['game'] : [$xml['games']['game']];

        $game_counter = 1;
        $datetime = null;
        foreach ($xml['games']['game'] as $game) {
            //Start Syracuse hack
            //format sample:  9:03pm Jul-5-2015
            $datetime = preg_replace('/(\d{1,2}:\d{2}(am|pm))\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{1})-(\d{4})/', '$1 $3-0$4-$5', $game['date']);

            $this->Game->create();
            $this->Game->set([
                'game_name' => "G{$game_counter}",
                'game_description' => '',
                'game_datetime' => date(DATE_ATOM, strtotime($datetime)),
                'type' => $type,
                'pdf_id' => (isset($game['file']) ? str_replace('.pdf', '', $game['file']) : null),
                'event_id' => $event_id,
                'center_id' => $center_id,
            ]);

            if ($this->Game->save()) {
                ++$game_counter;

                foreach ($game['player'] as $player) {
                    $player_id = $this->Scorecard->generatePlayer($player['name']);

                    //blue or yellow team gets autoconverted to green
                    $team = strtolower($player['team']);
                    if ('yellow' == $team || 'blue' == $team || 'ice' == $team || 'earth' == $team) {
                        $team = 'green';
                    }

                    if ('fire' == $team) {
                        $team = 'red';
                    }

                    if (!empty($player['survived'])) {
                        $survived = explode(':', $player['survived']);
                        $survivedSeconds = (($survived[0] * 60) + $survived[1]);
                    } else {
                        $survivedSeconds = null;
                    }

                    $this->Scorecard->create();
                    $this->Scorecard->set([
                        'player_name' => "{$player['name']}",
                        'game_datetime' => date(DATE_ATOM, strtotime($datetime)),
                        'team' => $team,
                        'position' => $player['position'],
                        'score' => ($player['score'] + (1000 * $player['penalties'])),
                        'survived' => $survivedSeconds,
                        'max_score' => 0,
                        'shots_hit' => $player['shotsHit'],
                        'shots_fired' => $player['shotsFired'],
                        'accuracy' => (($player['shotsFired'] > 0) ? ($player['shotsHit'] / $player['shotsFired']) : 0),
                        'times_zapped' => $player['timesZapped'],
                        'times_missiled' => $player['timesMissled'],
                        'missile_hits' => $player['missleHits'],
                        'nukes_detonated' => $player['nukesDetonated'],
                        'nukes_activated' => $player['nukesActivated'],
                        'nukes_canceled' => $player['nukeCancels'],
                        'medic_hits' => $player['medicHits'],
                        'own_medic_hits' => $player['ownMedicHits'],
                        'medic_nukes' => $player['medicNukes'],
                        'scout_rapid' => $player['scoutRapid'],
                        'life_boost' => $player['lifeBoost'],
                        'ammo_boost' => $player['ammoBoost'],
                        'lives_left' => $player['livesLeft'],
                        'shots_left' => $player['shotsLeft'],
                        'penalties' => $player['penalties'],
                        'shot_3hit' => $player['shot3hit'],
                        'elim_other_team' => $player['elimOtherTeam'],
                        'team_elim' => $player['teamElim'],
                        'own_nuke_cancels' => $player['ownNukeCancels'],
                        'shot_opponent' => $player['shotOpponent'],
                        'shot_team' => $player['shotTeam'],
                        'missiled_opponent' => $player['missiledOpponent'],
                        'missiled_team' => $player['missiledTeam'],
                        'resupplies' => $player['resupplies'],
                        'rank' => $player['rank'],
                        'bases_destroyed' => $player['basesDestroyed'],
                        'sp_earned' => ($player['shotOpponent'] + ($player['missiledOpponent'] * 2) + ($player['basesDestroyed'] * 5)),
                        'sp_spent' => (($player['nukesActivated'] * 20) + ($player['lifeBoost'] * 10) + ($player['ammoBoost'] * 15)),
                        'pdf_id' => (isset($game['file']) ? str_replace('.pdf', '', $game['file']) : null),
                        'player_id' => $player_id,
                        'center_id' => $center_id,
                        'game_id' => $this->Game->id,
                        'type' => $type,
                        'event_id' => $event_id,
                    ]);

                    if ($this->Scorecard->save()) {
                        ++$row;

                        $scorecard_id = $this->Scorecard->id;

                        for ($i = 1; $i <= $player['penalties']; ++$i) {
                            $this->Scorecard->Penalty->create();
                            $this->Scorecard->Penalty->set([
                                'type' => $event['Event']['penalty_default_type'],
                                'value' => $event['Event']['penalty_point_value'],
                                'mvp_value' => $event['Event']['penalty_mvp_value'],
                                'scorecard_id' => $scorecard_id,
                            ]);
                            $this->Scorecard->Penalty->save();
                        }

                        foreach ($player['playerTarget'] as $hits) {
                            $this->Scorecard->generatePlayer($hits['name']);
                            $this->Scorecard->Hit->storeHits($player['name'], $scorecard_id, $hits);
                        }

                        $this->Scorecard->generateMaxScore($scorecard_id);
                    }
                }
                $this->Game->updateGameWinner($this->Game->id);
                $this->Scorecard->generateMVP($this->Game->id);
            }
        }

        if ('social' == $type) {
            $this->Game->fixSocialGameNames(date('Y-m-d', strtotime($datetime)), $center_id);
        }

        $this->Session->setFlash("Added {$row} scorecards");
        $this->redirect(['controller' => 'scorecards', 'action' => 'nightly']);
    }
}
