<?php

    $data = [];
    foreach ($scorecards as $score) {
        if (!empty($score['Match']['id'])) {
            $game_name = 'R'.$score['Round']['round'].' M'.$score['Match']['match'].' G'.$score['Game']['league_game'];
            if ($score['Round']['is_finals']) {
                $game_name .= '(Finals)';
            }
        } else {
            $game_name = $score['Game']['game_name'];
        }

        if ('green' == $score['Game']['winner']) {
            $game_class = 'text-success';
        } else {
            $game_class = 'text-danger';
        }

        $team_name = null;
        if ('red' == $score['Scorecard']['team'] && !empty($score['Game']['red_team_id'])) {
            $team_name = $score['Red_Team']['name'];
        } elseif ('green' == $score['Scorecard']['team'] && !empty($score['Game']['green_team_id'])) {
            $team_name = $score['Green_Team']['name'];
        }

        $data[] = [
            'scorecard_id' => $score['Scorecard']['id'],
            'game_id' => $score['Scorecard']['game_id'],
            'player_id' => $score['Scorecard']['player_id'],
            'game_name' => $game_name,
            'game_name_link' => $this->Html->link($game_name, ['controller' => 'games', 'action' => 'view', $score['Game']['id']], ['class' => $game_class]),
            'game_datetime' => $score['Game']['game_datetime'],
            'game_winner' => $score['Game']['winner'],
            'winloss' => ($score['Scorecard']['team'] == $score['Game']['winner']) ? 'W' : 'L',
            'team' => $score['Scorecard']['team'],
            'team_name' => $team_name,
            'position' => $score['Scorecard']['position'],
            'score' => $score['Scorecard']['score'],
            'max_score' => $score['Scorecard']['max_score'],
            'score_ratio' => ($score['Scorecard']['max_score'] > 0) ? round($score['Scorecard']['score'] / $score['Scorecard']['max_score'], 2) : 0,
            'accuracy' => round($score['Scorecard']['accuracy'] * 100, 2),
            'mvp_points' => $score['Scorecard']['mvp_points'],
            'lives_left' => $score['Scorecard']['lives_left'],
            'shots_left' => $score['Scorecard']['shots_left'],
            'shot_opponent' => $score['Scorecard']['shot_opponent'],
            'times_zapped' => $score['Scorecard']['times_zapped'],
            'hit_diff' => ($score['Scorecard']['times_zapped'] > 0) ? round($score['Scorecard']['shot_opponent'] / $score['Scorecard']['times_zapped'], 2) : $score['Scorecard']['shot_opponent'],
            'missile_hits' => ('Commander' == $score['Scorecard']['position'] || 'Heavy Weapons' == $score['Scorecard']['position']) ? $score['Scorecard']['missile_hits'] : '-',
            'times_missiled' => $score['Scorecard']['times_missiled'],
            'medic_hits' => $score['Scorecard']['medic_hits'],
            'medic_nukes' => ('Commander' == $score['Scorecard']['position']) ? $score['Scorecard']['medic_nukes'] : '-',
            'shot_3hit' => ('Scout' == $score['Scorecard']['position']) ? $score['Scorecard']['shot_3hit'] : '-',
            'shot_team' => $score['Scorecard']['shot_team'],
            'missiled_team' => ('Commander' == $score['Scorecard']['position'] || 'Heavy Weapons' == $score['Scorecard']['position']) ? $score['Scorecard']['missiled_team'] : '-',
            'own_medic_hits' => $score['Scorecard']['own_medic_hits'],
            'nukes_activated' => ('Commander' == $score['Scorecard']['position']) ? $score['Scorecard']['nukes_activated'] : '-',
            'nukes_detonated' => ('Commander' == $score['Scorecard']['position']) ? $score['Scorecard']['nukes_detonated'] : '-',
            'nukes_canceled' => $score['Scorecard']['nukes_canceled'],
            'own_nuke_cancels' => $score['Scorecard']['own_nuke_cancels'],
            'scout_rapid' => ('Scout' == $score['Scorecard']['position']) ? $score['Scorecard']['scout_rapid'] : '-',
            'boost' => ('Ammo Carrier' == $score['Scorecard']['position']) ? $score['Scorecard']['ammo_boost'] : (('Medic' == $score['Scorecard']['position']) ? $score['Scorecard']['life_boost'] : '-'),
            'resupplies' => ('Ammo Carrier' == $score['Scorecard']['position'] || 'Medic' == $score['Scorecard']['position']) ? $score['Scorecard']['resupplies'] : '-',
            'pdf' => $score['Scorecard']['pdf_id'],
        ];
    }

    echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
