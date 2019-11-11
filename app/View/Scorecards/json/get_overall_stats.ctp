<?php
    $data = array();
    foreach ($response as $score) {
        $data[] = array(
            'player_name_link' => $this->Html->link($score['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $score['Player']['id'])),
            'player_id' => $score['Player']['id'],
            'player_name' => $score['Player']['player_name'],
            'avg_score' => $score[0]['avg_score'],
            'total_score' => $score[0]['total_score'],
            'avg_mvp' =>  round($score[0]['avg_mvp'], 2),
            'total_mvp' => round($score[0]['total_mvp'], 2),
            'avg_acc' => round($score[0]['avg_acc']*100, 2),
            'nuke_ratio' => round($score[0]['nuke_ratio'], 2),
            'hit_diff' => round($score[0]['hit_diff'], 2),
            'avg_missiles' => round($score[0]['avg_missiles'], 2),
            'avg_medic_hits' => round($score[0]['avg_medic_hits'], 2),
            'avg_3hit' => round($score[0]['avg_3hit'], 2),
            'avg_life_boost' => round($score[0]['avg_life_boost'], 2),
            'avg_ammo_boost' => round($score[0]['avg_ammo_boost'], 2),
            'avg_resup' => round($score[0]['avg_resup'], 2),
            'avg_lives' => round($score[0]['avg_lives'], 2),
            'elim_rate' => round($score[0]['elim_rate']*100, 2),
            'games_played' => $score[0]['games_played'],
            'games_won' => $score[0]['games_won']
        );
    }
    
    echo json_encode(compact('data'), JSON_NUMERIC_CHECK);