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
					<table class="table table-striped table-bordered table-hover table-condensed" id="commander_scores_table">
						<caption>Commander</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="table table-striped table-bordered table-hover table-condensed" id="heavy_scores_table">
						<caption>Heavy Weapons</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
			</div>
			<div class="row">
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="scout_scores_table">
						<caption>Scout</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="ammo_scores_table">
						<caption>Ammo Carrier</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="medic_scores_table">
						<caption>Medic</caption>
						<thead>
							<th>Name</th>
							<th>Score</th>
							<th>MVP</th>
						</thead>
						<tbody>
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
					<table class="table table-striped table-bordered table-hover table-condensed" id="games_played_leader_table">
						<thead>
							<th>Name</th>
							<th>Total Games</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="table table-striped table-bordered table-hover table-condensed" id="score_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Total Score</th>
						</thead>
						<tbody>
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
					<table class="table table-striped table-bordered table-hover table-condensed" id="medic_hits_leader_table">
						<thead>
							<th>Name</th>
							<th>Total Medic Hits</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="own_medic_hits_leader_table">
						<thead>
							<th>Name</th>
							<th>Own Medic Hits</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="medic_on_medic_hits_leader_table">
						<thead>
							<th>Name</th>
							<th>Medic On Medic Hits</th>
						</thead>
						<tbody>
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
					<table class="table table-striped table-bordered table-hover table-condensed" id="missiled_opponent_leader_table">
						<thead>
							<th>Name</th>
							<th>Total Missiles</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="times_missiled_leader_table">
						<thead>
							<th>Name</th>
							<th>Total Times Missiled</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="missiled_team_leader_table">
						<thead>
							<th>Name</th>
							<th>Team Missiles (You Idiot)</th>
						</thead>
						<tbody>
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
					<table class="table table-striped table-bordered table-hover table-condensed" id="nukes_detonated_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Total Nukes Detonated</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="nukes_canceled_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Total Nukes Canceled</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-4">
					<table class="table table-striped table-bordered table-hover table-condensed" id="own_nuke_cancels_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Own Nukes Canceled</th>
						</thead>
						<tbody>
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
					<table class="table table-striped table-bordered table-hover table-condensed" id="elim_other_team_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Eliminated Opposing Team</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="table table-striped table-bordered table-hover table-condensed" id="team_elim_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Own Team Eliminated</th>
						</thead>
						<tbody>
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
					<table class="table table-striped table-bordered table-hover table-condensed" id="current_win_streak_table">
						<thead>
							<th>Name</th>
							<th>Current Win Streak</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="table table-striped table-bordered table-hover table-condensed" id="current_loss_streak_table">
						<thead>
							<th>Name</th>
							<th>Current Losing Streak</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
			</div>
			<div class="row">
				<div class="col-sm-6">
					<table class="table table-striped table-bordered table-hover table-condensed" id="longest_win_streak_table">
						<thead>
							<th>Name</th>
							<th>Longest Win Streak</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="table table-striped table-bordered table-hover table-condensed" id="longest_loss_streak_table">
						<thead>
							<th>Name</th>
							<th>Longest Losing Streak</th>
						</thead>
						<tbody>
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
					<table class="table table-striped table-bordered table-hover table-condensed" id="shots_fired_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Shots Fired</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<table class="table table-striped table-bordered table-hover table-condensed" id="penalties_total_leader_table">
						<thead>
							<th>Name</th>
							<th>Penalties</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>
<script type="text/javascript">
	$(document).ready(function() {
		const params = new URLSearchParams(location.search);

		$.extend( true, $.fn.dataTable.defaults, {
			order: [[1, "desc"]],
			searching: false,
			lengthChange: false,
			pageLength: 5,
			pagingType: "simple",
			processing: true,
			language: {
				processing: '<i class="fa fa-circle-notch fa-spin fa-3x fa-fw">'
			}
		} );

		$("table[id$='_leader_table']").DataTable( {
			columns : [
				{ 
					data: function ( row, type, val, meta) {
						if (type === 'display') {
							return `<a href="/players/view/${row.player.id}?${params.toString()}">${row.player.player_name}</a>`;
						}
						return row.player.player_name;
					}
				},
				{ "data" : "value" },
			]
		});
		$("div[id$='_leader_table_processing']").show();

		$("table[id$='_scores_table']").DataTable( {
			columns : [
				{ 
					data: function ( row, type, val, meta) {
						if (type === 'display') {
							return `<a href="/players/view/${row.Player.id}?${params.toString()}">${row.Player.player_name}</a>`;
						}
						return row.Player.player_name;
					}
				},
				{ "data" : "Scorecard.final_score" },
				{ "data" : "Scorecard.mvp_points" },
			]
		});
		$("div[id$='_scores_table_processing']").show();

		$("table[id$='_streak_table']").DataTable( {
			columns : [
				{ "data" : "player_name" },
				{ "data" : "maxstreak" },
			]
		});
		$("div[id$='_streak_table_processing']").show();
		
		$.ajax({
			url: "<?php echo html_entity_decode($this->Html->url(array('controller' => 'Scorecards', 'action' => 'getPositionLeaderboards', 'ext' => 'json'))); ?>"
		}).done(function(response) {
			$("div[id$='_scores_table_processing']").hide();
			$('#commander_scores_table').DataTable().clear().rows.add(response.data.commander).draw();
			$('#heavy_scores_table').DataTable().clear().rows.add(response.data.heavy).draw();
			$('#scout_scores_table').DataTable().clear().rows.add(response.data.scout).draw();
			$('#ammo_scores_table').DataTable().clear().rows.add(response.data.ammo).draw();
			$('#medic_scores_table').DataTable().clear().rows.add(response.data.medic).draw();
		})

		$.ajax({
			url: "<?php echo html_entity_decode($this->Html->url(array('controller' => 'Scorecards', 'action' => 'getLeaderboards', 'ext' => 'json'))); ?>"
		}).done(function(response) {
			$("div[id$='_leader_table_processing']").hide();
			$('#games_played_leader_table').DataTable().clear().rows.add(response.data.games_played).draw();
			$('#score_total_leader_table').DataTable().clear().rows.add(response.data.score_total).draw();

			$('#medic_hits_leader_table').DataTable().clear().rows.add(response.data.medic_hits_total).draw();
			$('#own_medic_hits_leader_table').DataTable().clear().rows.add(response.data.own_medic_hits_total).draw();
			$('#medic_on_medic_hits_leader_table').DataTable().clear().rows.add(response.data.medic_on_medic_hits_total).draw();

			$('#missiled_opponent_leader_table').DataTable().clear().rows.add(response.data.missiled_opponent_total).draw();
			$('#times_missiled_leader_table').DataTable().clear().rows.add(response.data.times_missiled_total).draw();
			$('#missiled_team_leader_table').DataTable().clear().rows.add(response.data.missiled_team_total).draw();
			
			$('#nukes_detonated_total_leader_table').DataTable().clear().rows.add(response.data.nukes_detonated_total).draw();
			$('#nukes_canceled_total_leader_table').DataTable().clear().rows.add(response.data.nukes_canceled_total).draw();
			$('#own_nuke_cancels_total_leader_table').DataTable().clear().rows.add(response.data.own_nuke_cancels_total).draw();

			$('#elim_other_team_total_leader_table').DataTable().clear().rows.add(response.data.elim_other_team_total).draw();
			$('#team_elim_total_leader_table').DataTable().clear().rows.add(response.data.team_elim_total).draw();

			$('#shots_fired_total_leader_table').DataTable().clear().rows.add(response.data.shots_fired_total).draw();
			$('#penalties_total_leader_table').DataTable().clear().rows.add(response.data.penalties_total).draw();
		})

		$.ajax({
			url: "<?php echo html_entity_decode($this->Html->url(array('controller' => 'Scorecards', 'action' => 'getStreaks', 'wins', 'ext' => 'json'))); ?>"
		}).done(function(response) {
			$('#longest_win_streak_table_processing').hide();
			$('#longest_win_streak_table').DataTable().clear().rows.add(response.data).draw();
		})

		$.ajax({
			url: "<?php echo html_entity_decode($this->Html->url(array('controller' => 'Scorecards', 'action' => 'getStreaks', 'loss', 'ext' => 'json'))); ?>"
		}).done(function(response) {
			$('#longest_loss_streak_table_processing').hide();
			$('#longest_loss_streak_table').DataTable().clear().rows.add(response.data).draw();
		})

		$.ajax({
			url: "<?php echo html_entity_decode($this->Html->url(array('controller' => 'Scorecards', 'action' => 'getCurrentStreaks', 'ext' => 'json'))); ?>"
		}).done(function(response) {
			$('#current_win_streak_table_processing').hide();
			$('#current_loss_streak_table_processing').hide();
			$('#current_win_streak_table').DataTable().clear().rows.add(response.data.winStreaks).draw();
			$('#current_loss_streak_table').DataTable().clear().rows.add(response.data.lossStreaks).draw();
		})

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