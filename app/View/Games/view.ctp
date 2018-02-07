<?php
	$green_data = (!empty($game["Green_Scorecard"]) ? $game["Green_Scorecard"][0]["Green_Scorecard"][0] : null);
	$green_data_string = $game["Game"]["green_score"]+$game["Game"]["green_adj"].",$green_data[hit_diff],$green_data[accuracy],$green_data[mvp_points],$green_data[medic_hits],$green_data[lives_left],$green_data[shots_left],$green_data[missile_hits],$green_data[nukes_detonated],$green_data[resupplies],$green_data[bases_destroyed]";
	
	$red_data = (!empty($game["Red_Scorecard"]) ? $game["Red_Scorecard"][0]["Red_Scorecard"][0] : null);
	$red_data_string = $game["Game"]["red_score"]+$game["Game"]["red_adj"].",$red_data[hit_diff],$red_data[accuracy],$red_data[mvp_points],$red_data[medic_hits],$red_data[lives_left],$red_data[shots_left],$red_data[missile_hits],$red_data[nukes_detonated],$red_data[resupplies],$red_data[bases_destroyed]";
?>
<?php if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))): ?>
<div class="well well-lg">
	<h3 class="text-danger">IMPORTANT</h3>
	<p class="lead">
		Matches MUST be configured on the standings page before they can be applied here.
		In the dropdown, teams are listed in order of RED v GREEN.  Be sure to choose the 
		appropriate game number based on that.
	</p>	
</div>
<?php endif; ?>
<?php
	if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
		echo $this->Form->create('Game', array(
			'class' => 'form-horizontal', 
			'role' => 'form',
			'inputDefaults' => array(
			    'format' => array('before', 'label', 'between', 'input', 'error', 'after'),
			    'div' => array('class' => 'form-group'),
			    'class' => array('form-control'),
			    'label' => array('class' => 'col-lg-2 control-label'),
			    'between' => '<div class="col-lg-3">',
			    'after' => '</div>',
			    'error' => array('attributes' => array('wrap' => 'span', 'class' => 'help-inline')),
		)));
		echo $this->Form->input('id');
		if($selected_league['Event']['is_comp']) {
			$match_list = array();
			foreach($available_matches['Round'] as $round) {
				foreach($round['Match'] as $match) {
					if(empty($match['Game_1']) || $match['Game_1']['id'] == $game['Game']['id'])
						$match_list[$match['id']."|1"] = "R{$round['round']} M{$match['match']} G1 - {$match['Team_1']['name']} v {$match['Team_2']['name']}";
					
					if(empty($match['Game_2']) || $match['Game_2']['id'] == $game['Game']['id'])
						$match_list[$match['id']."|2"] = "R{$round['round']} M{$match['match']} G2 - {$match['Team_2']['name']} v {$match['Team_1']['name']}";
				}
			}
			echo $this->Form->input('league_id', array('type' => 'hidden'));
			echo $this->Form->input('match', array(
				'type' => 'select', 
				'options' => array($match_list),
				'empty' => 'Select a match/game',
				'selected' => $game['Game']['match_id']."|".$game['Game']['league_game'],
			));
		} else {
			echo $this->Form->input('game_name');
		}
		
		echo $this->Form->end(array('value' => 'Update', 'class' => 'btn btn-warning'));
		echo $this->Html->link("Delete Game", array('controller' => 'Games', 'action' => 'delete', $game['Game']['id']), array('class' => 'btn btn-danger'), __('ARE YOU VERY SURE YOU WANT TO DELETE # %s?  THIS WILL DELETE ALL ASSOCIATED SCORECARDS!!!', $game['Game']['id']));
	} else {
		echo "<h3 class=\"text-center\">";
		if(isset($game['Game']['event_id']) && !is_null($game['Match']['id'])) {
			echo 'R'.$game['Match']['Round']['round'].' M'.$game['Match']['match'].' G'.$game['Game']['league_game'];
		} else {
			echo $game['Game']['game_name'];
		}
		echo " <small>".$game['Game']['game_datetime']."</small></h3>";
	}
?>
<h3 class="row">
	<span class="col-md-4">
	<?php if(!empty($neighbors['prev'])): ?>
		<?= $this->Html->link("<span class=\"glyphicon glyphicon-backward\"></span> Previous Game", array('controller' => 'games', 'action' => 'view', $neighbors['prev']['Game']['game_id']), array('class' => 'btn btn-primary', 'escape' => false)); ?>
	<?php endif; ?>
	</span>
	<span class="col-md-4 text-center">
	<?php
		if($game['Game']['red_team_id'] != null)
			echo $this->Html->link($teams[$game['Game']['red_team_id']], array('controller' => 'teams', 'action' => 'view', $game['Game']['red_team_id']), array('class' => 'btn btn-danger'));
		else
			echo "Red Team";

		echo " vs ";

		if($game['Game']['green_team_id'] != null)
			echo $this->Html->link($teams[$game['Game']['green_team_id']], array('controller' => 'teams', 'action' => 'view', $game['Game']['green_team_id']), array('class' => 'btn btn-success'));
		else
			echo "Green Team";

		/*if (file_exists(WWW_ROOT."/pdf/LTC_SM5".$game['Game']['game_name']."_".date("Y-m-d_Hi",strtotime($game['Game']['game_datetime'])).".pdf")) {
			echo " - ".$this->Html->link("PDF", "/pdf/LTC_SM5".$game['Game']['game_name']."_".date("Y-m-d_Hi",strtotime($game['Game']['game_datetime'])).".pdf");
		} elseif (file_exists(WWW_ROOT."/pdf/".$game['Game']['pdf_id'].".pdf")) {
			echo " - ".$this->Html->link("PDF", "/pdf/".$game['Game']['pdf_id'].".pdf");
		}*/
		echo " - ".$this->Html->link("PDF", "http://scorecards.lfstats.com/".$game['Game']['pdf_id'].".pdf");
	?>
	</span>
	<span class="col-md-4 text-right">
	<?php if(!empty($neighbors['next'])): ?>
		<?= $this->Html->link("Next Game <span class=\"glyphicon glyphicon-forward\"></span> ", array('controller' => 'games', 'action' => 'view', $neighbors['next']['Game']['game_id']), array('class' => 'btn btn-primary', 'escape' => false)); ?></span>
	<?php endif; ?>
	</span>
</h3>
<ul class="nav nav-tabs" role="tablist" id="myTab">
	<li role="presentation" class="active"><a href="#game_scorecard_tab" role="tab" data-toggle="tab">Scorecard</a></li>
	<li role="presentation"><a href="#game_breakdown_tab" role="tab" data-toggle="tab">Breakdown</a></li>
</ul>
<div class="tab-content" id="tabs">
	<div role="tabpanel" class="tab-pane active" id="game_scorecard_tab">
		<br />
		<div class="well well-sm">Numbers in parentheses are score adjustments due to penalties and elimination bonuses</div>
		<?php 
			if($game['Game']['winner'] == 'green') {
				$winner = (($game['Game']['green_team_id'] != null) ? $teams[$game['Game']['green_team_id']] : "Green Team");
				$winner_panel = "panel panel-success";
				$winner_score = ($game['Game']['green_score']+$game['Game']['green_adj']);
				$winner_adj = "";
				if($game['Game']['green_adj'] != 0)
					$winner_adj = " (".$game['Game']['green_adj'].")";
					
				$loser = (($game['Game']['red_team_id'] != null) ? $teams[$game['Game']['red_team_id']] : "Red Team");
				$loser_panel = "panel panel-danger";
				$loser_score = ($game['Game']['red_score']+$game['Game']['red_adj']);
				$loser_adj = "";
				if($game['Game']['red_adj'] != 0)
					$loser_adj = " (".$game['Game']['red_adj'].")";
			} else {
				$winner = (($game['Game']['red_team_id'] != null) ? $teams[$game['Game']['red_team_id']] : "Red Team");
				$winner_panel = "panel panel-danger";
				$winner_score = ($game['Game']['red_score']+$game['Game']['red_adj']);
				$winner_adj = "";
				if($game['Game']['red_adj'] != 0)
					$winner_adj = " (".$game['Game']['red_adj'].")";
				
				$loser = (($game['Game']['green_team_id'] != null) ? $teams[$game['Game']['green_team_id']] : "Green Team");
				$loser_panel = "panel panel-success";
				$loser_score = ($game['Game']['green_score']+$game['Game']['green_adj']);
				$loser_adj = "";
				if($game['Game']['green_adj'] != 0)
					$loser_adj = " (".$game['Game']['green_adj'].")"; 
			}
			
			$winner_table = "";
			$loser_table = "";

			foreach ($game['Scorecard'] as $score) {
				$score_line = "";
				$penalty_score = 0;
				$penalty_string = "";
				
				if(isset($score['Penalty'])) {
					foreach ($score['Penalty'] as $penalty) {
						$penalty_score += $penalty['value'];
						$penalty_string .= "<button type=\"button\" class=\"btn btn-warning btn-block\" data-toggle=\"modal\" data-target=\"#penaltyModal\" target=\"".$this->Html->url(array('controller' => 'Penalties', 'action' => 'getPenalty', $penalty['id'], 'ext' => 'json'))."\">".$penalty['type']."</button>";
					}
				}
				
				$score_line .= "<tr class=\"text-center\">";
				
				if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
					$score_line .= "<td><form><input type=\"checkbox\" class=\"switch_sub_cbox\" id=".$score['id']." ".(($score['is_sub']) ? "checked" : "")."></form></td>";
				} else {
					$score_line .= (($score['is_sub']) ? "<td class=\"text-warning\"><span class=\"glyphicon glyphicon-asterisk\"></span></td>" : "<td></td>");
				}
				
				$score_line .= (($score['lives_left'] > 0) ? "<td class=\"text-success\"><span class=\"glyphicon glyphicon-ok\"></span>" : "<td class=\"text-danger text-center\"><span class=\"glyphicon glyphicon-remove\"></span>")."</td>";
				$score_line .= "<td>".$this->Html->link($score['player_name'], array('controller' => 'Players', 'action' => 'view', $score['player_id']), array('class' => 'btn btn-primary btn-block'))."</td>";
				$score_line .= "<td>".$score['position']."</td>";
				$score_line .= "<td>".($score['score']+$penalty_score).(($penalty_score != 0) ? " ($penalty_score)" : "")."</td>";
				$score_line .= "<td><button type=\"button\" class=\"btn btn-primary btn-block\" data-toggle=\"modal\" data-target=\"#mvpModal\" target=\"".$this->Html->url(array('controller' => 'scorecards', 'action' => 'getMVPBreakdown', $score['id'], 'ext' => 'json'))."\">".$score['mvp_points']."</button></td>";
				$score_line .= "<td>".$score['lives_left']."</td>";
				$score_line .= "<td>".$score['shots_left']."</td>";
				$score_line .= "<td><button type=\"button\" class=\"btn btn-primary btn-block\" data-toggle=\"modal\" data-target=\"#hitModal\" target=\"".$this->Html->url(array('controller' => 'scorecards', 'action' => 'getHitBreakdown', $score['player_id'], $score['game_id'], 'ext' => 'json'))."\">".round($score['shot_opponent']/max($score['times_zapped'],1),2)." (".$score['shot_opponent']."/".$score['times_zapped'].")</button></td>";
				$score_line .= "<td>".$score['missiled_opponent']."</td>";
				$score_line .= "<td>".$score['times_missiled']."</td>";
				$score_line .= "<td>".$score['medic_hits'].($score['position'] == 'Commander' ? "/".$score['medic_nukes'] : "")."</td>";
				$score_line .= "<td>".$score['shot_team']."</td>";
				$score_line .= "<td>".$score['missiled_team']."</td>";
				$score_line .= "<td>".round($score['accuracy']*100,2)."%</td>";
				$score_line .= "<td>".($score['position'] == 'Medic' || $score['position'] == 'Ammo Carrier' || $score['position'] == 'Commander' ? $score['sp_spent']."/".$score['sp_earned'] : "-")."</td>";
				$score_line .= "<td>".($score['position'] == 'Commander' ? $score['nukes_detonated']."/".$score['nukes_activated'] : "-")."</td>";
				$score_line .= "<td>".($score['nukes_canceled'] > 0 ? $score['nukes_canceled'] : "-")."</td>";
				$score_line .= "<td>".($score['position'] == 'Medic' ? $score['life_boost'] : ($score['position'] == 'Ammo Carrier' ? $score['ammo_boost'] : "-"))."</td>";
				$score_line .= "<td>".($score['position'] == 'Medic' || $score['position'] == 'Ammo Carrier' ? $score['resupplies'] : "-")."</td>";
				$score_line .= "<td>$penalty_string";
				if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
					$score_line.= $this->Html->link("Add", array('controller' => 'Penalties', 'action' => 'add', $score['id']), array('class' => 'btn btn-warning'));
				}
				$score_line .= "</td></tr>";
				
				if($score['team'] == $game['Game']['winner'])
					$winner_table .= $score_line;
				else
					$loser_table .= $score_line;
			}	
		?>
		<div id="winner_panel" class="<?= $winner_panel; ?>">
			<div class="panel-heading" data-toggle="collapse" data-parent="#winner_panel" data-target="#collapse_winner_panel" role="tab" id="winner_panel_heading">
				<h3 class="panel-title">
					<?= $winner; ?>
				</h3>
			</div>
			<div id="collapse_winner_panel" class="panel-collapse collapse in" role="tabpanel">
				<div class="panel-body">
					<h3 class="text-primary">
						<?= "Score: ".$winner_score.$winner_adj; ?>
						<span class="pull-right">
						<?php
							if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
								echo $this->Html->link("Add Team Penalty", array('controller' => 'TeamPenalties', 'action' => 'add', $game['Game']['id'], $game['Game']['winner']), array('class' => 'btn btn-warning'));
							}
							if($game['Game']['winner'] == 'green') {
								if(isset($game['Green_TeamPenalties'])) {
									foreach($game['Green_TeamPenalties'] as $team_penalty) {
										echo "<button type=\"button\" class=\"btn btn-warning btn-block\" data-toggle=\"modal\" data-target=\"#teamPenaltyModal\" target=\"".$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json'))."\">".$team_penalty['type']." (".$team_penalty["value"].")</button>";
									}
								}
							} elseif($game['Game']['winner'] == 'red') {
								if(isset($game['Red_TeamPenalties'])) {
									foreach($game['Red_TeamPenalties'] as $team_penalty) {
										echo "<button type=\"button\" class=\"btn btn-warning btn-block\" data-toggle=\"modal\" data-target=\"#teamPenaltyModal\" target=\"".$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json'))."\">".$team_penalty['type']." (".$team_penalty["value"].")</button>";
									}
								}
							}
						?>
						</span>
					</h3>
				</div>
				<div class="table-responsive">
					<table class="gamelist table table-striped table-bordered table-hover table-condensed">
						<thead>
							<th>Merc</th>
							<th>Alive</th>
							<th>Name</th>
							<th>Position</th>
							<th>Score</th>
							<th>MVP Points</th>
							<th>Lives Left</th>
							<th>Shots Left</th>
							<th>Hit Diff</th>
							<th>Missiled</th>
							<th>Got Missiled</th>
							<th>Medic Hits</th>
							<th>Shot Team</th>
							<th>Missiled Team</th>
							<th>Accuracy</th>
							<th>SP Spent/Earned</th>
							<th>Nukes</th>
							<th>Nuke Cancels</th>
							<th>Boosts</th>
							<th>Resupplies</th>
							<th>Penalties</th>
						</thead>
						<tbody>
							<?= $winner_table; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
		<div id="loser_panel" class="<?= $loser_panel; ?>">
			<div class="panel-heading" data-toggle="collapse" data-parent="#loser_panel" data-target="#collapse_loser_panel" role="tab" id="loser_panel_heading">
				<h3 class="panel-title">
					<?= $loser; ?>
				</h3>
			</div>
			<div id="collapse_loser_panel" class="panel-collapse collapse in" role="tabpanel">
				<div class="panel-body">
					<h3 class="text-primary">
						<?= "Score: ".$loser_score.$loser_adj; ?>
						<span class="pull-right">
							<?php
								if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
									echo $this->Html->link("Add Team Penalty", array('controller' => 'TeamPenalties', 'action' => 'add', $game['Game']['id'], (($game['Game']['winner'] == 'red') ? 'green' : 'red')), array('class' => 'btn btn-warning'));
								}
								if($game['Game']['winner'] == 'green') {
									if(isset($game['Red_TeamPenalties'])) {
										foreach($game['Red_TeamPenalties'] as $team_penalty) {
											echo "<button type=\"button\" class=\"btn btn-warning btn-block\" data-toggle=\"modal\" data-target=\"#teamPenaltyModal\" target=\"".$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json'))."\">".$team_penalty['type']." (".$team_penalty["value"].")</button>";
										}
									}
								} elseif($game['Game']['winner'] == 'red') {
									if(isset($game['Green_TeamPenalties'])) {
										foreach($game['Green_TeamPenalties'] as $team_penalty) {
											echo "<button type=\"button\" class=\"btn btn-warning btn-block\" data-toggle=\"modal\" data-target=\"#teamPenaltyModal\" target=\"".$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json'))."\">".$team_penalty['type']." (".$team_penalty["value"].")</button>";
										}
									}
								}
							?>
						</span>
					</h3>
				</div>
				<div class="table-responsive">
					<table class="gamelist table table-striped table-bordered table-hover table-condensed">
						<thead>
							<th>Merc</th>
							<th>Alive</th>
							<th>Name</th>
							<th>Position</th>
							<th>Score</th>
							<th>MVP Points</th>
							<th>Lives Left</th>
							<th>Shots Left</th>
							<th>Hit Diff</th>
							<th>Missiled</th>
							<th>Got Missiled</th>
							<th>Medic Hits</th>
							<th>Shot Team</th>
							<th>Missiled Team</th>
							<th>Accuracy</th>
							<th>SP Spent/Earned</th>
							<th>Nukes</th>
							<th>Nuke Cancels</th>
							<th>Boosts</th>
							<th>Resupplies</th>
							<th>Penalties</th>
						</thead>
						<tbody>
							<?= $loser_table; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
	<div role="tabpanel" class="tab-pane" id="game_breakdown_tab">
		<div id="breakdown_container"></div>
	</div>
</div>
<script type="text/javascript">
	$(document).ready(function() {
		$('.gamelist').DataTable( {
			"searching": false,
			"info": false,
			"paging": false,
			"ordering": false
		} );

		$('#breakdown_container').highcharts({
			chart: {
				type: 'bar',
				height: 700
			},
			title: {
				text: 'Game Breakdown'
			},
			xAxis: {
				categories: ['Score', 'Hit Diff', 'Accuracy', 'MVP', 'Medic Hits', 'Lives Left', 'Shots Left', 'Missiles', 'Nukes', 'Resupplies', 'Bases']
			},
			legend: {
				enabled: false
			},
			plotOptions: {
				series: {
					stacking: 'percent'
				}
			},
			series: [
				{
					name: 'Green Team',
					color: 'green',
					data: [<?= $green_data_string; ?>]
				},
				{
					name: 'Red Team',
					color: 'red',
					data: [<?= $red_data_string; ?>]
				}
			]
		});
	});
	
	$(document).on('shown.bs.tab', 'a[data-toggle="tab"]', function (e) {
		$('#breakdown_container').highcharts().reflow();
	});

	$('.switch_sub_cbox').change(function() {
		$.ajax({
			url: "/scorecards/ajax_switchSub/" + $(this).prop('id') + ".json",
			success: function(data) {
				toastr.success('Set Merc Status')
			}
		});
	});
</script>