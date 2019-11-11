<?php

    $green_wins_nonelim = 0;
    $green_wins_elim = 0;
    $red_wins_nonelim = 0;
    $red_wins_elim = 0;
    $green_wins_elim_avg_score = 0;
    $red_loses_elim_avg_score = 0;
    $green_wins_nonelim_avg_score = 0;
    $red_loses_nonelim_avg_score = 0;
    $red_wins_elim_avg_score = 0;
    $green_loses_elim_avg_score = 0;
    $red_wins_nonelim_avg_score = 0;
    $green_loses_nonelim_avg_score = 0;

    foreach ($overall as $line) {
        if ('green' == $line['Game']['winner']) {
            if (1 == $line['Game']['red_eliminated']) {
                $green_wins_elim += $line[0]['total'];
                $green_wins_elim_avg_score += $line[0]['green_avg_score'];
                $red_loses_elim_avg_score += $line[0]['red_avg_score'];
            } else {
                $green_wins_nonelim += $line[0]['total'];
                $green_wins_nonelim_avg_score += $line[0]['green_avg_score'];
                $red_loses_nonelim_avg_score += $line[0]['red_avg_score'];
            }
        } else {
            if (1 == $line['Game']['green_eliminated']) {
                $red_wins_elim += $line[0]['total'];
                $red_wins_elim_avg_score += $line[0]['red_avg_score'];
                $green_loses_elim_avg_score += $line[0]['green_avg_score'];
            } else {
                $red_wins_nonelim += $line[0]['total'];
                $red_wins_nonelim_avg_score += $line[0]['red_avg_score'];
                $green_loses_nonelim_avg_score += $line[0]['green_avg_score'];
            }
        }
    }

    $winloss = ['red_wins' => ($red_wins_nonelim + $red_wins_elim), 'green_wins' => ($green_wins_elim + $green_wins_nonelim)];
    $winlossdetail = [
        'elim_wins_from_red' => $red_wins_elim,
        'non_elim_wins_from_red' => $red_wins_nonelim,
        'elim_wins_from_green' => $green_wins_elim,
        'non_elim_wins_from_green' => $green_wins_nonelim,
    ];
    $scoredetail = [
        ['Game' => 'Green Wins (Elim)', 'green_score' => $green_wins_elim_avg_score, 'red_score' => $red_loses_elim_avg_score],
        ['Game' => 'Red Wins (Elim)', 'green_score' => $green_loses_elim_avg_score, 'red_score' => $red_wins_elim_avg_score],
        ['Game' => 'Green Wins (Non-Elim)', 'green_score' => $green_wins_nonelim_avg_score, 'red_score' => $red_loses_nonelim_avg_score],
        ['Game' => 'Red Wins (Non-Elim)', 'green_score' => $green_loses_nonelim_avg_score, 'red_score' => $red_wins_nonelim_avg_score],
    ];

    $averages = [];
    foreach ($overall_averages as $line) {
        $averages[] = ['position' => $line['Scorecard']['position'], 'avg_score' => $line[0]['avg_score'], 'avg_mvp' => $line[0]['avg_mvp']];
    }

    echo json_encode(compact('winloss', 'winlossdetail', 'scoredetail', 'averages'), JSON_NUMERIC_CHECK);
