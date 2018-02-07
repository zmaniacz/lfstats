<div id="all_center_teams" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="all_center_teams_heading">
		<h4 class="panel-title">
			All-Center Teams
		</h4>
	</div>
		<div class="panel-body">
			<div class="row">
				<div class="col-sm-6">
					Minimum Games:<br /><br />
					<div id="min_games_slider"></div>
				</div>
				<div class="col-sm-6">
					Timeframe:<br /><br />
					<select class="form-control" id="min_days_select">
						<option value="0">All Time</option>
						<option value="365" selected>Last 12 Months</option>
						<option value="120">Last 120 Days</option>
						<option value="90">Last 90 Days</option>
					</select>
				</div>
			</div>
			<div class="row">
				<div class="col-sm-6">
					<h3><span class="label label-success">1st Team</span></h3>
					<table class="allcenter table table-striped table-bordered table-hover" id="all_center_a">
						<thead>
							<th>Position</th>
							<th>Player</th>
							<th>Average MVP</th>
						</thead>
						<tbody>
						</tbody>
					</table>
				</div>
				<div class="col-sm-6">
					<h3><span class="label label-danger">2nd Team</span></h3>
					<table class="allcenter table table-striped table-bordered table-hover" id="all_center_b">
						<thead>
							<th>Position</th>
							<th>Player</th>
							<th>Average MVP</th>
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
		var min_games = 15;
		var min_days = 365;
		var all_center_table_a;
		var min_games_slider = document.getElementById("min_games_slider")

		$('.allcenter').DataTable( {
			searching: false,
			info: false,
			paging: false,
			ordering: false,
			columns: [
				{ data: "position" },
				{ 
					data: function( row, type, val, meta ) {
						return '<a href="/players/view/'+row.player_id+'?'+params.toString()+'">'+row.player_name+'</a>';
					},
				},
				{ 
					data: function ( row, type, val, meta ) {
						var avg_mvp = Math.round(row.avg_mvp * 100) / 100;
						if (type === 'display') {
							return avg_mvp;
						}
						return row.avg_mvp;
					}
				}
			]
		});

		function updateAllCenter(min_games, min_days) {
			params.set('min_games',min_games);
			params.set('min_days',min_days);

			$.ajax({
				"url" : "/scorecards/getAllCenter.json?"+params.toString()
			}).done(function(response) {
				$('#all_center_a').DataTable().clear().rows.add(response.all_center.team_a).draw();
				$('#all_center_b').DataTable().clear().rows.add(response.all_center.team_b).draw();
			})
		}

		updateAllCenter(min_games, min_days);

		if($("#min_games_slider").length) {
			noUiSlider.create(min_games_slider, {
				start: min_games,
				connect: [true, false],
				step: 5,
				range: {
					'min': 0,
					'max': 100
				}
			});

			min_games_slider.noUiSlider.on('update', function(values, handle, unencoded) {
				min_games = unencoded
				children = min_games_slider.getElementsByClassName('noUi-handle');
				children[0].dataset.value = min_games;
			})

			min_games_slider.noUiSlider.on('end', function(values, handle, unencoded) {
				updateAllCenter(min_games, min_days);
			});
		}

		$("#min_days_select").change(function() {
			min_days = this.value;
			updateAllCenter(min_games, min_days);
		});
	});
</script>
