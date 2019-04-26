<?php
    $stats = array(
        "games_played",
        "score_total",
        "medic_hits_total",
        "own_medic_hits_total",
        "missiled_opponent_total",
        "times_missiled_total",
        "missiled_team_total",
        "nukes_detonated_total",
        "nukes_canceled_total",
        "own_nuke_cancels_total",
        "elim_other_team_total",
        "team_elim_total",
        "shots_fired_total",
    );

    foreach ($stats as $stat) {
        $$stat = array();
    }

    foreach ($leaderboards as $item) {
        foreach ($stats as $stat) {
            if ($item[0][$stat] > 0) {
                ${$stat}[] = array(
                    "player" => $item['Player'],
                    "value" => $item[0][$stat]
                );
            }
        }
    }

    $medic_on_medic_hits_total = array();
    foreach ($medic_on_medic as $item) {
        if ($item[0]['medic_hits_total'] > 0) {
            $medic_on_medic_hits_total[] = array(
                "player" => $item['Player'],
                "value" => $item[0]['medic_hits_total']
            );
        }
    }

    $penalties_total = array();
    foreach ($penalties as $item) {
        if ($item[0]['penalties'] > 0) {
            $penalties_total[] = array(
                "player" => $item['Player'],
                "value" => $item[0]['penalties']
            );
        }
    }

    $data = array();

    foreach ($stats as $stat) {
        $data[$stat] = $$stat;
    }

    $data['medic_on_medic_hits_total'] = $medic_on_medic_hits_total;
    $data['penalties_total'] = $penalties_total;

    echo json_encode(compact('data'), JSON_NUMERIC_CHECK);