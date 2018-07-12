<?php
	$data = array(
        "commander" => $commander,
        "heavy" => $heavy,
        "scout" => $scout,
        "ammo" => $ammo,
        "medic" => $medic
    );

	echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
?>