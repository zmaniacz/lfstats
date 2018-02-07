<?php

class Center extends AppModel {
	public $hasMany = array(
		'Scorecard' => array(
			'className' => 'Scorecard',
			'foreignkey' => 'center_id'
		),
		'Player' => array(
			'className' => 'Player',
			'foreignKey' => 'center_id'
		),
		'Game' => array(
			'className' => 'Game',
			'foreignKey' => 'center_id'
		)
	);
	
	public function getCenterDetails($short_name) {
		$results = $this->find('first', array(
			'fields' => array('id','type'),
			'conditions' => array('short_name' => $short_name)
		));
		
		return $results;
	}
}
?>