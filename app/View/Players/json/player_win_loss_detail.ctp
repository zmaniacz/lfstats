<?php
	$wins = 0;
	$losses = 0;
	$red_wins = 0;
	$red_losses = 0;
	$red_wins_elim = 0;
	$green_wins_elim = 0;
	$red_losses_elim = 0;
	$green_losses_elim = 0;

	foreach($games as $game) {
		if($game['Scorecard']['team'] == 'red') {
			if($game['Game']['winner'] == 'red') {
				$wins++;
				$red_wins++;
				if($game['Game']['green_eliminated'] > 0) {
					$red_wins_elim++;
				}
			} else {
				$losses++;
				$red_losses++;
				if($game['Game']['red_eliminated'] > 0) {
					$red_losses_elim++;
				}
			}
		} else {
			if($game['Game']['winner'] == 'green') {
				$wins++;
				if($game['Game']['red_eliminated'] > 0) {
					$green_wins_elim++;
				}
			} else {
				$losses++;
				if($game['Game']['green_eliminated'] > 0) {
					$green_losses_elim++;
				}
			}
		}
	}
	
	
	$winloss = array(
		'wins' => $wins,
		'losses' => $losses
	);
	$winlossdetail = array(
		'elim_wins_from_red' => $red_wins_elim,
		'non_elim_wins_from_red' => ($red_wins - $red_wins_elim),
		'elim_wins_from_green' => $green_wins_elim,
		'non_elim_wins_from_green' => ($wins - $red_wins - $green_wins_elim),
		'elim_losses_from_red' => $red_losses_elim,
		'non_elim_losses_from_red' => ($red_losses - $red_losses_elim),
		'elim_losses_from_green' => $green_losses_elim,
		'non_elim_losses_from_green' => ($losses - $red_losses - $green_losses_elim)
	);
	
	echo json_encode(compact('winloss','winlossdetail'));
?>