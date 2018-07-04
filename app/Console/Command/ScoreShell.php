<?php
class ScoreShell extends AppShell {
    public $uses = array('Scorecard');
    public function main() {
        $scorecards = $this->Scorecard->find('all', array(
            'conditions' => array(
                'max_score' => NULL
            )
        ));

        foreach($scorecards as $score) {
            $this->Scorecard->generateMaxScore($score['Scorecard']['id']);
        }
    }
}