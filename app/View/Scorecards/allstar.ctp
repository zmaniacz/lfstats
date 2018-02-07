<?php if($this->Session->read('state.gametype') == 'league'): ?>
	<form class="form-inline">
		<div class="checkbox">
			<label for="rounds_cbox">Show Rounds</label>
			<input type="checkbox" id="rounds_cbox" <?= (($this->Session->read('state.show_rounds') == 'true') ? "checked" : "")?>>
			<label for="finals_cbox">Show Finals</label>
			<input type="checkbox" id="finals_cbox" <?= (($this->Session->read('state.show_finals') == 'true') ? "checked" : "")?>>
			<label for="sub_cbox">Show Subs</label>
			<input type="checkbox" id="sub_cbox" <?= (($this->Session->read('state.show_subs') == 'true') ? "checked" : "")?>>
		</div>
	</form>
<?php endif; ?>
<div id="commander" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#commander" data-target="#collapse_commander" role="tab" id="commander_heading">
		<h4 class="panel-title">
			Commander
		</h4>
	</div>
	<div id="collapse_commander" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="table-responsive">
				<table class="table table-striped table-bordered table-hover" id="commander_allstar_table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Games at Position / Total</th>
							<th>Average MVP Points</th>
						</tr>
					</thead>
				</table>
			</div>
		</div>
	</div>
</div>
<div id="heavy" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#heavy" data-target="#collapse_heavy" role="tab" id="heavy_heading">
		<h4 class="panel-title">
			Heavy Weapons
		</h4>
	</div>
	<div id="collapse_heavy" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="table-responsive">
				<table class="table table-striped table-bordered table-hover" id="heavy_allstar_table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Games at Position / Total</th>
							<th>Average MVP Points</th>
						</tr>
					</thead>
				</table>
			</div>
		</div>
	</div>
</div>
<div id="scout" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#scout" data-target="#collapse_scout" role="tab" id="scout_heading">
		<h4 class="panel-title">
			Scout
		</h4>
	</div>
	<div id="collapse_scout" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="table-responsive">
				<table class="table table-striped table-bordered table-hover" id="scout_allstar_table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Games at Position / Total</th>
							<th>Average MVP Points</th>
						</tr>
					</thead>
				</table>
			</div>
		</div>
	</div>
</div>
<div id="ammo" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#ammo" data-target="#collapse_ammo" role="tab" id="ammo_heading">
		<h4 class="panel-title">
			Ammo Carrier
		</h4>
	</div>
	<div id="collapse_ammo" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="table-responsive">
				<table class="table table-striped table-bordered table-hover" id="ammo_allstar_table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Games at Position / Total</th>
							<th>Average MVP Points</th>
						</tr>
					</thead>
				</table>
			</div>
		</div>
	</div>
</div>
<div id="medic" class="panel panel-primary">
	<div class="panel-heading" data-toggle="collapse" data-parent="#medic" data-target="#collapse_medic" role="tab" id="medic_heading">
		<h4 class="panel-title">
			Medic
		</h4>
	</div>
	<div id="collapse_medic" class="panel-collapse collapse in" role="tabpanel">
		<div class="panel-body">
			<div class="table-responsive">
				<table class="table table-striped table-bordered table-hover" id="medic_allstar_table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Games at Position / Total</th>
							<th>Average MVP Points</th>
						</tr>
					</thead>
				</table>
			</div>
		</div>
	</div>
</div>
<script type="text/javascript">
	$(document).ready(function() {
		$('#commander_allstar_table').DataTable( {
			"deferRender" : true,
			"order": [[2, "desc"]],
			"ajax" : {
				"url" : "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getAllStarStats', 'ext' => 'json'))); ?>",
				"dataSrc": "data.commander"
			},
			"columns" : [
				{ "data" : "name" },
				{ "data" : function ( row, type, val, meta ) {
						var ratio = Math.round((row.games_played/row.total_games_played) * 100);
						if (type === 'display') {
							return row.games_played+'/'+row.total_games_played;
						}
						
						return ratio;
					}
				},
				{ "data" : "avg_mvp" }
			]
		});
		
		$('#heavy_allstar_table').DataTable( {
			"deferRender" : true,
			"order": [[2, "desc"]],
			"ajax" : {
				"url" : "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getAllStarStats', 'ext' => 'json'))); ?>",
				"dataSrc": "data.heavy"
			},
			"columns" : [
				{ "data" : "name" },
				{ "data" : function ( row, type, val, meta ) {
						var ratio = Math.round((row.games_played/row.total_games_played) * 100);
						if (type === 'display') {
							return row.games_played+'/'+row.total_games_played;
						}
						
						return ratio;
					}
				},
				{ "data" : "avg_mvp" }
			]
		});
		
		$('#scout_allstar_table').DataTable( {
			"deferRender" : true,
			"order": [[2, "desc"]],
			"ajax" : {
				"url" : "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getAllStarStats', 'ext' => 'json'))); ?>",
				"dataSrc": "data.scout"
			},
			"columns" : [
				{ "data" : "name" },
				{ "data" : function ( row, type, val, meta ) {
						var ratio = Math.round((row.games_played/row.total_games_played) * 100);
						if (type === 'display') {
							return row.games_played+'/'+row.total_games_played;
						}
						
						return ratio;
					}
				},
				{ "data" : "avg_mvp" }
			]
		});
		
		$('#ammo_allstar_table').DataTable( {
			"deferRender" : true,
			"order": [[2, "desc"]],
			"ajax" : {
				"url" : "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getAllStarStats', 'ext' => 'json'))); ?>",
				"dataSrc": "data.ammo"
			},
			"columns" : [
				{ "data" : "name" },
				{ "data" : function ( row, type, val, meta ) {
						var ratio = Math.round((row.games_played/row.total_games_played) * 100);
						if (type === 'display') {
							return row.games_played+'/'+row.total_games_played;
						}
						
						return ratio;
					}
				},
				{ "data" : "avg_mvp" }
			]
		});
		
		$('#medic_allstar_table').DataTable( {
			"deferRender" : true,
			"order": [[2, "desc"]],
			"ajax" : {
				"url" : "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getAllStarStats', 'ext' => 'json'))); ?>",
				"dataSrc": "data.medic"
			},
			"columns" : [
				{ "data" : "name" },
				{ "data" : function ( row, type, val, meta ) {
						var ratio = Math.round((row.games_played/row.total_games_played) * 100);
						if (type === 'display') {
							return row.games_played+'/'+row.total_games_played;
						}
						
						return ratio;
					}
				},
				{ "data" : "avg_mvp" }
			]
		});

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
		$('#rounds_cbox').change(function() {
			if($('#rounds_cbox').is(':checked')) {
				window.location = "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterRounds', 'true'))); ?>";
			} else {
				window.location = "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterRounds', 'false'))); ?>";
			}
		});
	});
</script>