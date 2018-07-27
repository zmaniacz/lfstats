<?php
class GameShell extends AppShell {
    public $uses = array('Scorecard','Game');
    public function main() {
        $this->Scorecard->generateGames();
    }

    public function validate() {
        $games = $this->Game->find('all');

        foreach($games as $game) {
            $this->Game->updateGameWinner($game['Game']['id']);
        }
    }
}