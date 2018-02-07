<?php
class GameShell extends AppShell {
    public $uses = array('Scorecard');
    public function main() {
        $this->Scorecard->generateGames();
    }
}