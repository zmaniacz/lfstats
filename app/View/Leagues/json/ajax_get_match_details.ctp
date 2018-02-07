<?php
	$match_complete = ($match['Match']['team_1_points']+$match['Match']['team_2_points'] == 6) ? true : false;

	$team_1 = "{$match['Team_1']['name']}<br />";
	$team_2 = "{$match['Team_2']['name']}<br />";

	if($match_complete && $match['Match']['team_1_points'] > $match['Match']['team_2_points']) {
		$team_1 .= "<strong>{$match['Match']['team_1_points']}</strong>";
		$team_2 .= "{$match['Match']['team_2_points']}";
	} elseif($match_complete && $match['Match']['team_1_points'] < $match['Match']['team_2_points']) {
		$team_1 .= "{$match['Match']['team_1_points']}";
		$team_2 .= "<strong>{$match['Match']['team_2_points']}</strong>";
	} else {
		$team_1 .= (isset($match['Match']['team_1_points'])) ? "{$match['Match']['team_1_points']}" : 0;
		$team_2 .= (isset($match['Match']['team_2_points'])) ? "{$match['Match']['team_2_points']}" : 0;
	}

	$game_1_name = "R{$match['Round']['round']} M{$match['Match']['match']} G1";
	$game_2_name = "R{$match['Round']['round']} M{$match['Match']['match']} G2";

	$game_1_red_score = $match['Game_1']['red_score']+$match['Game_1']['red_adj'];
	$game_1_green_score = $match['Game_1']['green_score']+$match['Game_1']['green_adj'];

	$game_2_red_score = $match['Game_2']['red_score']+$match['Game_2']['red_adj'];
	$game_2_green_score = $match['Game_2']['green_score']+$match['Game_2']['green_adj'];

	$team_1_diff = ($game_1_red_score + $game_2_green_score) - ($game_1_green_score + $game_2_red_score);
	$team_2_diff = ($game_1_green_score + $game_2_red_score) - ($game_1_red_score + $game_2_green_score);

	if($team_1_diff > 0) {
		$team_1 .= "<br /><span class=\"text-success\">$team_1_diff</span>";
	} else {
		$team_1 .= "<br /><span class=\"text-danger\">$team_1_diff</span>";
	}

	if($team_2_diff > 0) {
		$team_2 .= "<br /><span class=\"text-success\">$team_2_diff</span>";
	} else {
		$team_2 .= "<br /><span class=\"text-danger\">$team_2_diff</span>";
	}
?>
<div class="row">
	<div class="col-xs-4 col-xs-offset-2">
		<h3 class="text-right"><?=$team_1; ?></h3>
	</div>
	<div class="col-xs-2">
		<h3 class="text-center"> VS </h3>
	</div>
	<div class="col-xs-4">
		<h3 class="text-left"><?=$team_2; ?></h3>
	</div>
</div>
<div class="row">
	<hr>
</div>
<div class="row">
	<div class="col-xs-2">
		<?= $this->Html->link($game_1_name, array('controller' => 'Games', 'action' => 'view', $match['Game_1']['id']), array('class' => 'btn btn-primary')); ?>
	</div>
	<div class="col-xs-4 text-danger text-right">
		<?= ($match['Game_1']['winner'] == 'red') ? "<strong>$game_1_red_score</strong>" : $game_1_red_score; ?>
	</div>
	<div class="col-xs-4 col-xs-offset-2 text-success text-left">
		<?= ($match['Game_1']['winner'] == 'green') ? "<strong>$game_1_green_score</strong>" : $game_1_green_score; ?>
	</div>
</div>
<div class="row">
	<hr>
</div>
<div class="row">
	<div class="col-xs-2">
		<?= $this->Html->link($game_2_name, array('controller' => 'Games', 'action' => 'view', $match['Game_2']['id']), array('class' => 'btn btn-primary')); ?>
	</div>
	<div class="col-xs-4 text-success text-right">
		<?= ($match['Game_2']['winner'] == 'green') ? "<strong>$game_2_green_score</strong>" : $game_2_green_score; ?>
	</div>
	<div class="col-xs-4 col-xs-offset-2 text-danger text-left">
		<?= ($match['Game_2']['winner'] == 'red') ? "<strong>$game_2_red_score</strong>" : $game_2_red_score; ?>
	</div>
</div>