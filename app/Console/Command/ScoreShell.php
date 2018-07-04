<?php
class ScoreShell extends AppShell {
    public $uses = array('Scorecard');
    public function main() {
        $scorecards = $this->Scorecard->find('all', array(
            'conditions' => array(
                'max_score' => NULL
            ),
            'limit' => 5000
        ));

        foreach($scorecards as $score) {
            $this->Scorecard->generateMaxScore($score['Scorecard']['id']);
        }
    }
}