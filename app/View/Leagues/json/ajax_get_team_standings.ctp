<?php
    foreach($data as &$standing) {
        $standing['name'] = $this->Html->link($standing['name'], array('controller' => 'teams', 'action' => 'view', $standing['id']), array('class' => 'btn btn-block btn-primary'));
        $standing['match_win_lose'] = $standing['matches_won']." - ".($standing['matches_played']-$standing['matches_won']);
        $standing['game_win_lose'] = $standing['won']." - ".($standing['played']-$standing['won']);
        $standing['score_ratio'] =  round($standing['ratio'], 2)." (".number_format($standing['for'])."/".number_format($standing['against']).")";
    }
	echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
?>