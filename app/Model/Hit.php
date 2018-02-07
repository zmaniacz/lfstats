<?php

class Hit extends AppModel {
    public $belongsTo = array(
		'Scorecard' => array(
			'className' => 'Scorecard',
			'foreignKey' => 'scorecard_id'
		),
		'Player' => array(
			'className' => 'Player',
			'foreignKey' => 'player_id'
		),
		'Target' => array(
			'className' => 'Player',
			'foreignKey' => 'target_id'
		)
	);
    
    public function storeHits($player, $scorecard_id, $hits) {
        $player = $this->Player->PlayersName->find('first', array(
            'conditions' => array(
                'player_name' => $player
            )
        ));
        
        $target = $this->Player->PlayersName->find('first', array(
            'conditions' => array(
                'player_name' => $hits['name']
            )
        ));
        
        $this->create();
        $this->set(array(
            'hits' => $hits['playerHit'],
            'missiles' => $hits['playerMsl'],
            'player_id' => $player['PlayersName']['player_id'],
            'target_id' => $target['PlayersName']['player_id'],
            'scorecard_id' => $scorecard_id
        ));
        $this->save();
    }
}
?>