<?php
    $winStreaks = array();
    $lossStreaks = array();

	foreach($data as $item) {
        $entry = array(
            'player_id' => $item['streakset']['player_id'],
            'player_name' => $item['players']['player_name'],
            'maxstreak' => $item[0]['maxstreak']
        );

        if($item['streakset']['gameresult'] == 'W') {
            $winStreaks[] = $entry;
        }  else {
            $lossStreaks[] = $entry;
        }

	}

	$data = array("winStreaks" => $winStreaks, "lossStreaks" => $lossStreaks);

	echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
?>