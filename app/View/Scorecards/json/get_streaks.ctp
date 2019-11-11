<?php

    $results = [];

    foreach ($data as $item) {
        $load = [
            'player_id' => $item[0]['player_id'],
            'player_name' => $item[0]['player_name'],
            'maxstreak' => $item[0]['max'], ];

        if ('W' == $item[0]['result']) {
            $results['win'][] = $load;
        } else {
            $results['loss'][] = $load;
        }
    }

    $data = $results;

    echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
