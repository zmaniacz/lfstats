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

	foreach($overall as $line) {
		if($line['Game']['winner'] == 'green') {
			if($line['Game']['red_eliminated'] == 1) {
				$green_wins_elim += $line[0]['Total'];
				$green_wins_elim_avg_score += $line[0]['green_avg_score'];
				$red_loses_elim_avg_score += $line[0]['red_avg_score'];
			} else {
				$green_wins_nonelim += $line[0]['Total'];
				$green_wins_nonelim_avg_score += $line[0]['green_avg_score'];
				$red_loses_nonelim_avg_score += $line[0]['red_avg_score'];
			}
		} else {
			if($line['Game']['green_eliminated'] == 1) {
				$red_wins_elim += $line[0]['Total'];
				$red_wins_elim_avg_score += $line[0]['red_avg_score'];
				$green_loses_elim_avg_score += $line[0]['green_avg_score'];
			} else {
				$red_wins_nonelim += $line[0]['Total'];
				$red_wins_nonelim_avg_score += $line[0]['red_avg_score'];
				$green_loses_nonelim_avg_score += $line[0]['green_avg_score'];
			}
		}
	}
	
	$winloss = array('red_wins' => ($red_wins_nonelim + $red_wins_elim), 'green_wins' => ($green_wins_elim + $green_wins_nonelim));
	$winlossdetail = array(
		'elim_wins_from_red' => $red_wins_elim,
		'non_elim_wins_from_red' => $red_wins_nonelim,
		'elim_wins_from_green' => $green_wins_elim,
		'non_elim_wins_from_green' => $green_wins_nonelim
	);
	$scoredetail = array(
		array('Game' => 'Green Wins (Elim)', 'green_score' => $green_wins_elim_avg_score, 'red_score' => $red_loses_elim_avg_score),
		array('Game' => 'Red Wins (Elim)', 'green_score' => $green_loses_elim_avg_score, 'red_score' => $red_wins_elim_avg_score),
		array('Game' => 'Green Wins (Non-Elim)', 'green_score' => $green_wins_nonelim_avg_score, 'red_score' => $red_loses_nonelim_avg_score),
		array('Game' => 'Red Wins (Non-Elim)', 'green_score' => $green_loses_nonelim_avg_score, 'red_score' => $red_wins_nonelim_avg_score),
	);

	$averages = array();
	foreach($overall_averages as $line) {
		$averages[] = array('position' => $line['Scorecard']['position'], 'avg_score' => $line[0]['avg_score'], 'avg_mvp' => $line[0]['avg_mvp']);
	}
	
	echo json_encode(compact('winloss','winlossdetail','scoredetail','averages','overall_mvp'), JSON_NUMERIC_CHECK);
?>