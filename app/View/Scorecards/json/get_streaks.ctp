<?php
	$results = array();

	foreach($data as $item) {
		$results[] = array(
			'player_id' => $item['streakset']['player_id'],
			'player_name' => $item['players']['player_name'],
			'maxstreak' => $item[0]['maxstreak']
		);
	}

	$data = $results;

	echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
?>