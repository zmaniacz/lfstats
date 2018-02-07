<?php
    foreach($data as &$record) {
        $record['name'] = $this->Html->link($players[$record['opponent_id']], array('controller' => 'Players', 'action' => 'view', $record['opponent_id']), array('class' => 'btn btn-block btn-primary'));
        $record['hit_ratio'] = round($record['hits']/max(1,$record['hit_by']),2);
        $record['missile_ratio'] = round($record['missiles']/max(1,$record['missile_by']),2);
    }
	echo json_encode(compact('data'), JSON_NUMERIC_CHECK);
?>