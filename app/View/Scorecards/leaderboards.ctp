<?php if($this->Session->read('state.gametype') == 'league'): ?>
	<form class="form-inline">
		<div class="checkbox">
			<label for="rounds_cbox">Show Finals</label>
			<input type="checkbox" id="finals_cbox" <?= (($this->Session->read('state.show_finals') == 'true') ? "checked" : "")?>>
			<label for="sub_cbox">Show Subs</label>
			<input type="checkbox" id="sub_cbox" <?= (($this->Session->read('state.show_subs') == 'true') ? "checked" : "")?>>
		</div>
	</form>
<?php endif; ?>
<div id="positions" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#positions" data-target="#collapse_positions" role="tab" id="positions_heading">
		<h4 class="panel-title">
			Positions
		</h4>
	</div>
	<div id="collapse_positions" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="games_played_table">
						<caption>Commander</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
							<?php foreach ($commander as $row): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['score'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['mvp_points'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
							</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="games_played_table">
						<caption>Heavy Weapons</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
							<?php foreach ($heavy as $row): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['score'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['mvp_points'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
							</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
			<div class="row">
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="games_played_table">
						<caption>Scout</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
							<?php foreach ($scout as $row): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['score'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['mvp_points'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
							</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="games_played_table">
						<caption>Ammo Carrier</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
							<?php foreach ($ammo as $row): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['score'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['mvp_points'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
							</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="games_played_table">
						<caption>Medic</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
							<?php foreach ($medic as $row): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['score'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
								<td><?php echo $this->Html->link($row['Scorecard']['mvp_points'], array('controller' => 'games', 'action' => 'view', $row['Scorecard']['game_id'])); ?></td>
							</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="games_points" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#games_points" data-target="#collapse_games_points" role="tab" id="games_points_heading">
		<h4 class="panel-title">
			Games and Points
		</h4>
	</div>
	<div id="collapse_games_points" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="games_played_table">
						<thead>
							<th>Name</th>
							<th>Total Games</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['games_played'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['games_played']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="score_total_total">
						<thead>
							<th>Name</th>
							<th>Total Score</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['score_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['score_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="medic_tomfoolery" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#medic_tomfoolery" data-target="#collapse_medic_tomfoolery" role="tab" id="medic_tomfoolery_heading">
		<h4 class="panel-title">
			Medic Tomfoolery
		</h4>
	</div>
	<div id="collapse_medic_tomfoolery" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="medic_hits_table">
						<thead>
							<th>Name</th>
							<th>Total Medic Hits</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['medic_hits_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['medic_hits_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="own_medic_hits_table">
						<thead>
							<th>Name</th>
							<th>Own Medic Hits</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['own_medic_hits_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['own_medic_hits_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="medic_on_medic_hits_table">
						<thead>
							<th>Name</th>
							<th>Medic On Medic Hits</th>
						</thead>
						<tbody>
							<?php foreach ($medic_on_medic as $row): ?>
							<?php if ($row[0]['medic_hits_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['medic_hits_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="missile_malarkey" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#missile_malarkey" data-target="#collapse_missile_malarkey" role="tab" id="missile_malarkey_heading">
		<h4 class="panel-title">
			Missile Malarkey
		</h4>
	</div>
	<div id="collapse_missile_malarkey" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="missiled_opponent_table">
						<thead>
							<th>Name</th>
							<th>Total Missiles</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['missiled_opponent_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['missiled_opponent_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="times_missiled_table">
						<thead>
							<th>Name</th>
							<th>Total Times Missiled</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['times_missiled_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['times_missiled_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="missiled_team_table">
						<thead>
							<th>Name</th>
							<th>Team Missiles (You Idiot)</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['missiled_team_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['missiled_team_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="nuke_nonsense" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#nuke_nonsense" data-target="#collapse_nuke_nonsense" role="tab" id="nuke_nonsense_heading">
		<h4 class="panel-title">
			Nuke Nonsense
		</h4>
	</div>
	<div id="collapse_nuke_nonsense" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="nukes_detonated_total_table">
						<thead>
							<th>Name</th>
							<th>Total Nukes Detonated</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['nukes_detonated_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['nukes_detonated_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="nukes_canceled_total_table">
						<thead>
							<th>Name</th>
							<th>Total Nukes Canceled</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['nukes_canceled_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['nukes_canceled_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="own_nuke_cancels_total_table">
						<thead>
							<th>Name</th>
							<th>Own Nukes Canceled</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['own_nuke_cancels_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['own_nuke_cancels_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="elimination_frustration" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#elimination_frustration" data-target="#collapse_elimination_frustration" role="tab" id="elimination_frustration_heading">
		<h4 class="panel-title">
			Elimination Frustration
		</h4>
	</div>
	<div id="collapse_elimination_frustration" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="elim_other_team_total_table">
						<thead>
							<th>Name</th>
							<th>Eliminated Opposing Team</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['elim_other_team_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['elim_other_team_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="team_elim_total_table">
						<thead>
							<th>Name</th>
							<th>Own Team Eliminated</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['team_elim_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['team_elim_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="streaky" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#streaky" data-target="#collapse_streaky" role="tab" id="streaky_heading">
		<h4 class="panel-title">
			Streaky
		</h4>
	</div>
	<div id="collapse_streaky" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="elim_other_team_total_table">
						<thead>
							<th>Name</th>
							<th>Current Win Streak</th>
						</thead>
						<tbody>
							<?php foreach ($current_streaks as $row): ?>
							<?php if($row['streakset']['gameresult'] == 'W'): ?>
							<tr>
								<td><?php echo $this->Html->link($row['players']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['streakset']['player_id'])); ?></td>
								<td><?php echo $row[0]['maxstreak']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="elim_other_team_total_table">
						<thead>
							<th>Name</th>
							<th>Current Losing Streak</th>
						</thead>
						<tbody>
							<?php foreach ($current_streaks as $row): ?>
							<?php if($row['streakset']['gameresult'] == 'L'): ?>
							<tr>
								<td><?php echo $this->Html->link($row['players']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['streakset']['player_id'])); ?></td>
								<td><?php echo $row[0]['maxstreak']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
			<div class="row">
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="elim_other_team_total_table">
						<thead>
							<th>Name</th>
							<th>Longest Win Streak</th>
						</thead>
						<tbody>
							<?php foreach ($winstreaks as $row): ?>
							<tr>
								<td><?php echo $this->Html->link($row['players']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['streakset']['player_id'])); ?></td>
								<td><?php echo $row[0]['maxstreak']; ?></td>
							</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="elim_other_team_total_table">
						<thead>
							<th>Name</th>
							<th>Longest Losing Streak</th>
						</thead>
						<tbody>
							<?php foreach ($lossstreaks as $row): ?>
							<tr>
								<td><?php echo $this->Html->link($row['players']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['streakset']['player_id'])); ?></td>
								<td><?php echo $row[0]['maxstreak']; ?></td>
							</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="misc_mischief" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#misc_mischief" data-target="#collapse_misc_mischief" role="tab" id="misc_mischief_heading">
		<h4 class="panel-title">
			Miscellaneous Mischief
		</h4>
	</div>
	<div id="collapse_misc_mischief" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="shots_fired_total_table">
						<thead>
							<th>Name</th>
							<th>Shots Fired</th>
						</thead>
						<tbody>
							<?php foreach ($leaderboards as $row): ?>
							<?php if ($row[0]['shots_fired_total'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['shots_fired_total']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="display table table-striped table-bordered table-hover table-condensed" id="penalties_total_table">
						<thead>
							<th>Name</th>
							<th>Penalties</th>
						</thead>
						<tbody>
							<?php foreach ($penalties as $row): ?>
							<?php if ($row[0]['penalties'] > 0): ?>
							<tr>
								<td><?php echo $this->Html->link($row['Player']['player_name'], array('controller' => 'Players', 'action' => 'view', $row['Player']['id'])); ?></td>
								<td><?php echo $row[0]['penalties']; ?></td>
							</tr>
							<?php endif; ?>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<script type="text/javascript">
	$(document).ready(function() {
		$('.display').DataTable( {
			"order": [[1, "desc"]],
			"searching": false,
			"lengthChange": false,
			"pageLength": 5,
			"pagingType": "simple"
		} );

		$('#sub_cbox').change(function() {
			if($('#sub_cbox').is(':checked')) {
				window.location = "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterSub', 'true'))); ?>";
			} else {
				window.location = "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterSub', 'false'))); ?>";
			}
		});
		$('#finals_cbox').change(function() {
			if($('#finals_cbox').is(':checked')) {
				window.location = "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterFinals', 'true'))); ?>";
			} else {
				window.location = "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterFinals', 'false'))); ?>";
			}
		});
	});
</script>