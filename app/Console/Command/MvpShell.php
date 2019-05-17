<?php
class MvpShell extends AppShell
{
    public $uses = array('Scorecard','Game');
    public function main()
    {
        $games = $this->Game->find('all');

        foreach ($games as $game) {
            $this->out($game['Game']['id'], 1, Shell::NORMAL);
            $this->Scorecard->generateMVP($game['Game']['id']);
        }
    }
}