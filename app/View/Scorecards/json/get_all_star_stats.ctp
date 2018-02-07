<?php
	$data = array();
	
	foreach ($response as $key => $value) {
		if($value['Commander']['games_played']/$value['total_games'] > .5) {
			$data['commander'][] = array( 
				'name' => $this->Html->link($value['player_name'], array('controller' => 'Players', 'action' => 'view', $key), array('class' => 'btn btn-block btn-primary')),
				'total_games_played' => round($value['total_games'],2),
				'avg_mvp' => round($value['Commander']['avg_mvp'],2),
				'games_played' => round($value['Commander']['games_played'],2),
			);
		}

		if($value['Heavy Weapons']['games_played']/$value['total_games'] > .5) {
			$data['heavy'][] = array( 
				'name' => $this->Html->link($value['player_name'], array('controller' => 'Players', 'action' => 'view', $key), array('class' => 'btn btn-block btn-primary')),
				'total_games_played' => round($value['total_games'],2),
				'avg_mvp' => round($value['Heavy Weapons']['avg_mvp'],2),
				'games_played' => round($value['Heavy Weapons']['games_played'],2),
			);
		}

		if($value['Scout']['games_played']/$value['total_games'] > .5) {
			$data['scout'][] = array( 
				'name' => $this->Html->link($value['player_name'], array('controller' => 'Players', 'action' => 'view', $key), array('class' => 'btn btn-block btn-primary')),
				'total_games_played' => round($value['total_games'],2),
				'avg_mvp' => round($value['Scout']['avg_mvp'],2),
				'games_played' => round($value['Scout']['games_played'],2),
			);
		}

		if($value['Ammo Carrier']['games_played']/$value['total_games'] > .5) {
			$data['ammo'][] = array( 
				'name' => $this->Html->link($value['player_name'], array('controller' => 'Players', 'action' => 'view', $key), array('class' => 'btn btn-block btn-primary')),
				'total_games_played' => round($value['total_games'],2),
				'avg_mvp' => round($value['Ammo Carrier']['avg_mvp'],2),
				'games_played' => round($value['Ammo Carrier']['games_played'],2),
			);
		}

		if($value['Medic']['games_played']/$value['total_games'] > .5) {
			$data['medic'][] = array( 
				'name' => $this->Html->link($value['player_name'], array('controller' => 'Players', 'action' => 'view', $key), array('class' => 'btn btn-block btn-primary')),
				'total_games_played' => round($value['total_games'],2),
				'avg_mvp' => round($value['Medic']['avg_mvp'],2),
				'games_played' => round($value['Medic']['games_played'],2),
			);
		}
	}
	
	echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
?>