<?php
	$scorecards = array();

	$wins = 0;
	$losses = 0;
	$red_wins = 0;
	$red_losses = 0;
	$red_wins_elim = 0;
	$green_wins_elim = 0;
	$red_losses_elim = 0;
	$green_losses_elim = 0;


	$team_mvp = 0;
	$team_shots_fired = 0;
	$team_shots_hit = 0;
	$team_games = 0;
	$team_medic_hits = 0;

	//Gather alll the scorecards into a single array
	foreach($team['Red_Game'] as $game) {
		foreach($game['Red_Scorecard'] as $scorecard) {
			$scorecards[] = $scorecard;
		}

		if($game['winner'] == 'red') {
			$wins++;
			$red_wins++;
			if($game['green_eliminated'] > 0) {
				$red_wins_elim++;
			}
		} else {
			$losses++;
			$red_losses++;
			if($game['red_eliminated'] > 0) {
				$red_losses_elim++;
			}
		}

		$team_games++;
	}

	foreach($team['Green_Game'] as $game) {
		foreach($game['Green_Scorecard'] as $scorecard) {
			$scorecards[] = $scorecard;
		}

		if($game['winner'] == 'green') {
			$wins++;
			if($game['red_eliminated'] > 0) {
				$green_wins_elim++;
			}
		} else {
			$losses++;
			if($game['green_eliminated'] > 0) {
				$green_losses_elim++;
			}
		}

		$team_games++;
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
	
	//populate plyer positions
	$player_positions = array();
	foreach($scorecards as $scorecard) {
		if(!$scorecard['is_sub']) {
			if(!isset($player_positions[$scorecard['player_name']])) {
				$player_positions[$scorecard['player_name']] = array(
					'Commander' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
					'Heavy Weapons' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
					'Scout' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
					'Ammo Carrier' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
					'Medic' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0)
				);
			}

			$player_positions[$scorecard['player_name']][$scorecard['position']]['games_played'] += 1;
			$player_positions[$scorecard['player_name']][$scorecard['position']]['total_mvp'] += $scorecard['mvp_points'];
			$player_positions[$scorecard['player_name']][$scorecard['position']]['total_score'] += $scorecard['score'];

			$team_mvp += $scorecard['mvp_points'];
			$team_shots_fired += $scorecard['shots_fired'];
			$team_shots_fired += $scorecard['shots_hit'];
			$team_medic_hits += $scorecard['medic_hits'];;
		}
	}
?>
<h2 class="text-warning"><?= $details['Event']['name']; ?> - <?= $team['EventTeam']['name']; ?></h2>
<div class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#win_loss_panel" data-target="#collapse_win_loss" role="tab" id="positions_heading">
		<h4 class="panel-title">
			Wins/Losses
		</h4>
	</div>
	<div id="collapse_win_loss" class="panel-collapse collapse" role="tabpanel">
		<div class="panel-body">
			<div id="win_loss_pie" style="height: 400px; width: 400px"></div>
		</div>
	</div>
</div>
<div class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#team_detail_panel" data-target="#collapse_team_detail" role="tab" id="positions_heading">
		<h4 class="panel-title">
			Team Detail
		</h4>
	</div>
	<div id="collapse_team_detail" class="panel-collapse collapse" role="tabpanel">
		<div class="panel-body">
			<dl class="dl-horizontal">
				<dt>Games Played</dt>
				<dd><?= $team_games; ?></dd>
			</dl>
		</div>
	</div>
</div>
<div id="positions_panel" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#positions_panel" data-target="#collapse_positions" role="tab" id="positions_heading">
		<h4 class="panel-title">
			Positions Detail
		</h4>
	</div>
	<div id="collapse_positions" class="panel-collapse collapse" role="tabpanel">
		<div class="panel-body">
			<table class="table table-striped table-bordered table-hover table-condensed" id="positions_table">
				<thead>
					<tr>
						<th class="col-xs-2">Player</th>
						<th colspan="3" class="col-xs-2">Commander</th>
						<th colspan="3" class="col-xs-2">Heavy Weapons</th>
						<th colspan="3" class="col-xs-2">Scout</th>
						<th colspan="3" class="col-xs-2">Ammo Carrier</th>
						<th colspan="3" class="col-xs-2">Medic</th>
					</tr>
					<tr>
						<th></th>
						<th>Games</th>
						<th>Avg. MVP</th>
						<th>Avg. Score</th>
						<th>Games</th>
						<th>Avg. MVP</th>
						<th>Avg. Score</th>
						<th>Games</th>
						<th>Avg. MVP</th>
						<th>Avg. Score</th>
						<th>Games</th>
						<th>Avg. MVP</th>
						<th>Avg. Score</th>
						<th>Games</th>
						<th>Avg. MVP</th>
						<th>Avg. Score</th>
					</tr>
				</thead>
				<tbody class="text-center">
					<?php foreach($player_positions as $player => $position): ?>
						<tr>
							<td><?= $player; ?></td>
							<td><?= $position['Commander']['games_played']; ?></td>
							<td><?= round($position['Commander']['total_mvp']/max($position['Commander']['games_played'],1),2); ?></td>
							<td><?= round($position['Commander']['total_score']/max($position['Commander']['games_played'],1),0); ?></td>
							<td><?= $position['Heavy Weapons']['games_played']; ?></td>
							<td><?= round($position['Heavy Weapons']['total_mvp']/max($position['Heavy Weapons']['games_played'],1),2); ?></td>
							<td><?= round($position['Heavy Weapons']['total_score']/max($position['Heavy Weapons']['games_played'],1),0); ?></td>
							<td><?= $position['Scout']['games_played']; ?></td>
							<td><?= round($position['Scout']['total_mvp']/max($position['Scout']['games_played'],1),2); ?></td>
							<td><?= round($position['Scout']['total_score']/max($position['Scout']['games_played'],1),0); ?></td>
							<td><?= $position['Ammo Carrier']['games_played']; ?></td>
							<td><?= round($position['Ammo Carrier']['total_mvp']/max($position['Ammo Carrier']['games_played'],1),2); ?></td>
							<td><?= round($position['Ammo Carrier']['total_score']/max($position['Ammo Carrier']['games_played'],1),0); ?></td>
							<td><?= $position['Medic']['games_played']; ?></td>
							<td><?= round($position['Medic']['total_mvp']/max($position['Medic']['games_played'],1),2); ?></td>
							<td><?= round($position['Medic']['total_score']/max($position['Medic']['games_played'],1),0); ?></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	</div>
</div>
<div>
	<input class="pull-right" type="text" id="search-criteria" placeholder="Search Matches..." />
	<?php foreach($details['Round'] as $round): ?>
		<div class="page-header">
			<h3><?= (($round['is_finals']) ? "Finals" : "Round ".$round['round']); ?></h3>
		</div>
		<div class="row">
		<?php foreach($round['Match'] as $match): ?>
			<div class="col-md-4 match-panel">
				<div class="panel panel-primary">
					<div class="panel-heading">
						<button type="button" class="btn btn-primary btn-sm pull-right" data-toggle="modal" data-target="#matchModal" target="<?= $this->Html->url(array('controller' => 'leagues', 'action' => 'ajax_getMatchDetails', $match['id'], 'ext' => 'json')); ?>">More...</button>
						<h5><?= (($round['is_finals']) ? "Finals" : "R".$round['round'])." M".$match['match']; ?></h5>
					</div>
					<div class="panel-body">
						<table class="table table-condensed">
							<thead>
								<tr>
									<th>Team</th>
									<th>Game 1</th>
									<th>Game 2</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>
										<?php
											if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
												echo "<select id=\"Match{$match['match']}Team1\" 
														class=\"match-select form-control\" 
														data-match-id={$match['id']}
														data-match-number={$match['match']}
														data-round-id={$match['round_id']}
														data-team=1
														>";
												echo "<option value=\"\">Select a team</option>";
												foreach($teams as $key => $value) {
													if($key == $match['team_1_id'])
														echo "<option value=\"$key\" selected>$value</option>";
													else
														echo "<option value=\"$key\">$value</option>";
												}
												echo "</select>";
											} else {
												echo (is_null($match['team_1_id'])) ? "TBD" : $this->Html->link($teams[$match['team_1_id']], array('controller' => 'teams', 'action' => 'view', $match['team_1_id']));
											}
											echo " <strong>{$match['team_1_points']}</strong>";
											if(!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_1_points'] > $match['team_2_points'])
												echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
										?>
									</td>
									<td class="text-center">
										<?php 
											if(!empty($match['Game_1'])) {
												if( ($match['Game_1']['winner'] == 'red' && $match['team_1_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_1_id'] == $match['Game_1']['green_team_id']))
													echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
												else
													echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
											}
										?>
									</td>
									<td class="text-center">
										<?php 
											if(!empty($match['Game_2'])) {
												if( ($match['Game_2']['winner'] == 'red' && $match['team_1_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_1_id'] == $match['Game_2']['green_team_id']))
													echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
												else
													echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
											}
										?>
									</td>
								</tr>
								<tr>
									<td>
										<?php
											if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
												echo "<select id=\"Match{$match['match']}Team2\" 
														class=\"match-select form-control\" 
														data-match-id={$match['id']}
														data-match-number={$match['match']}
														data-round-id={$match['round_id']}
														data-team=2
														>";
												echo "<option value=\"\">Select a team</option>";
												foreach($teams as $key => $value) {
													if($key == $match['team_2_id'])
														echo "<option value=\"$key\" selected>$value</option>";
													else
														echo "<option value=\"$key\">$value</option>";
												}
												echo "</select>";
											} else {
												echo (is_null($match['team_2_id'])) ? "TBD" : $this->Html->link($teams[$match['team_2_id']], array('controller' => 'teams', 'action' => 'view', $match['team_2_id']));
											}
											echo " <strong>{$match['team_2_points']}</strong>";
											if(!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_2_points'] > $match['team_1_points'])
												echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
										?>
									</td>
									<td class="text-center">
										<?php 
											if(!empty($match['Game_1'])) {
												if( ($match['Game_1']['winner'] == 'red' && $match['team_2_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_2_id'] == $match['Game_1']['green_team_id']))
													echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
												else
													echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
											}
										?>
									</td>
									<td class="text-center">
										<?php 
											if(!empty($match['Game_2'])) {
												if( ($match['Game_2']['winner'] == 'red' && $match['team_2_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_2_id'] == $match['Game_2']['green_team_id']))
													echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
												else
													echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
											}
										?>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		<?php endforeach; ?>
		</div>
	<?php endforeach; ?>
</div>
<script>
	$(document).ready(function(){
		$('#search-criteria').keyup(function(){
			$('.match-panel').hide();
			var txt = $('#search-criteria').val();
			$('.match-panel').each(function(){
			if($(this).text().toUpperCase().indexOf(txt.toUpperCase()) != -1){
				$(this).show();
			}
			});
		});

		function displayWinLossPie(data) {
			var winloss = [
				{ name:'Wins', y: data['winloss']['wins'], drilldown:'wins'},
				{ name:'Losses', y: data['winloss']['losses'], drilldown:'losses'},
			];
			var winlossdetail = [
				{name:'Wins', id:'wins', data: [
					{name: 'Red Win - Elim', color: "#FF0000", distance: 0, y: data['winlossdetail']['elim_wins_from_red']},
					{name: 'Red Win - Non-Elim', color: "#CC0000", y: data['winlossdetail']['non_elim_wins_from_red']},
					{name: 'Green Win - Elim', color: "#00FF00", y: data['winlossdetail']['elim_wins_from_green']},
					{name: 'Green Win - Non-Elim', color: "#00CC00", y: data['winlossdetail']['non_elim_wins_from_green']}
				]},
				{name:'Losses', id:'losses', data: [
					{name: 'Red Loss - Elim', color: "#FF0000", distance: 0, y: data['winlossdetail']['elim_losses_from_red']},
					{name: 'Red Loss - Non-Elim', color: "#CC0000", y: data['winlossdetail']['non_elim_losses_from_red']},
					{name: 'Green Loss - Elim', color: "#00FF00", y: data['winlossdetail']['elim_losses_from_green']},
					{name: 'Green Loss - Non-Elim', color: "#00CC00", y: data['winlossdetail']['non_elim_losses_from_green']}
				]}
			];
			
			Highcharts.chart('win_loss_pie', {
				chart: {
					type: 'pie'
				},
				title: {
					text: 'Wins & Losses'
				},
				subtitle: {
					text: 'Click the slices for details'
				},
				legend: {
					enabled: true,
					borderWidth: 1,
					borderColor: 'gray',
					align: 'left',
					verticalAlign: 'top',
					layout: 'vertical',
					x: 0, y: 50
				},
				yAxis: {
					title: {
						text: 'Wins'
					}
				},
				plotOptions: {
					pie: {
						allowPointSelect: true,
						cursor: 'pointer',
						dataLabels: { enabled: false },
						showInLegend: true
					}
				},			
				series: [{
					name: 'Wins & Losses',
					data: winloss
				}],
				drilldown: {
					drillUpButton: {
						relativeTo: 'plotBox',
						position: {
							verticalAlign: 'top'
						}
					},	
					series: winlossdetail
				}
			});
		}

		displayWinLossPie(<?= json_encode(compact('winloss','winlossdetail')); ?>);
	});
</script>
