<?php
/**
 *
 *
 * CakePHP(tm) : Rapid Development Framework (http://cakephp.org)
 * Copyright (c) Cake Software Foundation, Inc. (http://cakefoundation.org)
 *
 * Licensed under The MIT License
 * For full copyright and license information, please see the LICENSE.txt
 * Redistributions of files must retain the above copyright notice.
 *
 * @copyright     Copyright (c) Cake Software Foundation, Inc. (http://cakefoundation.org)
 * @link          http://cakephp.org CakePHP(tm) Project
 * @package       app.View.Layouts
 * @since         CakePHP(tm) v 0.10.0.1076
 * @license       http://www.opensource.org/licenses/mit-license.php MIT License
 */
//debug($this->Session->read());
?>
<!DOCTYPE html>
<html lang="en">
<head>
	<meta name="viewport" content="width=device-width, initial-scale=1" http-equiv="Content-Type" content="text/html; charset=utf-8">
	<script src='https://cdnjs.cloudflare.com/ajax/libs/jquery/3.3.1/jquery.min.js'></script>
	<script defer src="https://use.fontawesome.com/releases/v5.0.6/js/all.js"></script>
	<script defer src='https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js'></script>
	<script defer src='https://cdnjs.cloudflare.com/ajax/libs/datatables/1.10.16/js/jquery.dataTables.min.js'></script>
	<script defer src='https://cdnjs.cloudflare.com/ajax/libs/datatables/1.10.16/js/dataTables.bootstrap.min.js'></script>
	<script defer src='https://cdn.datatables.net/responsive/2.2.1/js/dataTables.responsive.min.js'></script>
	<script defer src='https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js'></script>
	<script defer src='https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/11.0.3/nouislider.min.js'></script>
	<script defer src='https://code.highcharts.com/stock/highstock.js'></script>
	<script defer src='https://code.highcharts.com/stock/highcharts-more.js'></script>
	<script defer src='https://code.highcharts.com/stock/indicators/indicators.js'></script>
	<?php
		echo $this->Html->css('https://maxcdn.bootstrapcdn.com/bootswatch/3.3.7/paper/bootstrap.min.css');
		echo $this->Html->css('https://cdnjs.cloudflare.com/ajax/libs/datatables/1.10.16/css/dataTables.bootstrap.min.css');
		echo $this->Html->css('https://cdn.datatables.net/responsive/2.2.1/css/responsive.dataTables.min.css');
		echo $this->Html->css('https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/css/toastr.min.css');
		echo $this->Html->css('https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/11.0.3/nouislider.min.css');
		echo $this->Html->css('laserforce');
	?>
	<title>
		<?php echo $title_for_layout; ?>
	</title>
</head>
<body>
	<script>
		$(document).ready(function() {
			Highcharts.setOptions({
				chart: {
					style: {
						fontFamily: '"Open Sans","Helvetica Neue",Helvetica,Arial,sans-serif'
					}
				}
			});
		});
	</script>
	<div class="container">
		<div id="container">
			<div id="header">
				<nav class="navbar navbar-inverse navbar-fixed-top">
					<div class="container-fluid">
						<div class="navbar-header">
							<button type="button" class="navbar-toggle collapsed" data-toggle="collapse" data-target="#bs-example-navbar-collapse-1">
								<span class="icon-bar"></span>
								<span class="icon-bar"></span>
								<span class="icon-bar"></span>
							</button>
      						<a class="navbar-brand" href="/scorecards/landing"><span class="glyphicon glyphicon-home"></span></a>
    					</div>
						<div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">
							<ul class="nav navbar-nav">
								<li><?php
									if($this->Session->read('state.isComp') > 0) {
										echo $this->Html->link('Standings', array('controller' => 'leagues', 'action' => 'standings'));
									} else {
										echo $this->Html->link('Nightly Stats', array('controller' => 'scorecards', 'action' => 'nightly'));
									}
								?></li>
								<li><?= $this->Html->link('Top Players', array('controller' => 'scorecards', 'action' => 'overall')); ?></li>
								<li><?= $this->Html->link('Game List', array('controller' => 'games', 'action' => 'index')); ?></li>
								<li><?= $this->Html->link('Leader(Loser)boards', array('controller' => 'scorecards', 'action' => 'leaderboards')); ?></li>
								<li><?= $this->Html->link('Center Stats', array('controller' => 'games', 'action' => 'overall')); ?></li>
								<li><?php
									if($this->Session->read('state.isComp') > 0) {
										echo $this->Html->link('All Star Rankings', array('controller' => 'scorecards', 'action' => 'allstar'));
									} else {
										echo $this->Html->link('All-Center Teams', array('controller' => 'scorecards', 'action' => 'allcenter'));
									}
								?></li>
								<li><?= $this->Html->link('Penalties', array('controller' => 'penalties', 'action' => 'index')); ?></li>
								<li><?= $this->Html->link('About SM5', array('controller' => 'pages', 'action' => 'aboutSM5')); ?></li>
                                <li><?= $this->Html->link('Twitch', array('controller' => 'pages', 'action' => 'twitch'), array('id' => 'twitch_status')); ?></li>
                                <li><?= $this->Html->link('WCT 2018', array('controller' => 'leagues', 'action' => 'standings', '?' => array('gametype' => 'league', 'leagueID' => 18, 'centerID' => 10))); ?></li>
								<?php if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))): ?>
									<li><?= $this->Html->link('Upload PDFs', array('controller' => 'uploads', 'action' => 'index')); ?></li>
								<?php endif; ?>
							</ul>
							<ul class="nav navbar-nav navbar-right">
								<li>
								<?php if (AuthComponent::user('id')): ?>
									<a class="btn btn-sm" href="/users/logout" role="button"><?= AuthComponent::user('username') ?> Logout</a>
								<?php else: ?>
									<a class="btn btn-sm" href="/users/login" role="button">Login</a>
								<?php endif; ?>
								</li>
							</ul>
						</div>
					</div>
				</nav>
				<ul class="breadcrumb">
					<li class="dropdown">
						<button class="btn btn-default dropdown-toggle" type="button" id="dropdownMenu1" data-toggle="dropdown">
						<?=	Inflector::camelize(($this->Session->read('state.isComp') > 0) ? 'competitive' : $this->Session->read('state.gametype')); ?> 
						 <span class="caret"></span></button>
						<ul class="dropdown-menu">
							<li><?= $this->Html->link('All', array(
														'controller' => $this->request->params['controller'], 
														'action' => $this->request->params['action'],
														implode(",", $this->request->pass),
														'?' => array(
															'gametype' => 'all',
															'centerID' => 0,
															'leagueID' => 0,
															'isComp' => 0
														)
								)); ?>
							</li>
							<li><?= $this->Html->link('Social', array(
														'controller' => $this->request->params['controller'], 
														'action' => $this->request->params['action'],
														implode(",", $this->request->pass),
														'?' => array(
															'gametype' => 'social',
															'centerID' => $this->Session->read('state.centerID'),
															'leagueID' => 0,
															'isComp' => 0
														)
								)); ?>
							</li>
							<li><?= $this->Html->link('Competitive', array(
														'controller' => $this->request->params['controller'], 
														'action' => $this->request->params['action'],
														implode(",", $this->request->pass),
														'?' => array(
															'gametype' => 'league',
															'centerID' => $this->Session->read('state.centerID'),
															'leagueID' => $this->Session->read('state.leagueID'),
															'isComp' => 1
														)
								)); ?>
							</li>
						</ul>
					</li>
					<li class="dropdown">
						<button class="btn btn-default dropdown-toggle" type="button" id="dropdownMenu2" data-toggle="dropdown">
							<?php
								if($this->Session->read('state.isComp') > 0) {
									echo $leagues[$this->Session->read('state.leagueID')];
								} elseif($this->Session->read('state.centerID') > 0) {
									echo $centers[$this->Session->read('state.centerID')];
								} else {
									echo 'All Games';
								}
							?>
						 <span class="caret"></span>
						</button>
						<ul class="dropdown-menu">
							<li><?= $this->Html->link('All Games', array(
									'controller' => $this->request->params['controller'], 
									'action' => $this->request->params['action'],
									implode(",", $this->request->pass),
									'?' => array(
										'gametype' => $this->Session->read('state.gametype'),
										'centerID' => 0,
										'leagueID' => 0,
										'isComp' => 0
									)
								));
								?>
							</li>
							<li class="divider"></li>
							<?php
								if($this->Session->read('state.gametype') == 'all' || $this->Session->read('state.gametype') == 'social') {
									echo "<li class=\"dropdown-header\">Centers</li>";
									$sorted_centers = $centers;
									asort($sorted_centers);
									foreach($sorted_centers as $key => $value) {
										echo "<li>".$this->Html->link($value, array(
											'controller' => $this->request->params['controller'], 
											'action' => $this->request->params['action'],
											implode(",", $this->request->pass),
											'?' => array(
												'gametype' => $this->Session->read('state.gametype'),
												'centerID' => $key,
												'leagueID' => 0,
												'isComp' => 0
											)
										))."</li>";
									}
								}
								if($this->Session->read('state.gametype') == 'all' || $this->Session->read('state.isComp') > 0) {
									echo "<li class=\"dropdown-header\">Competitions</li>";
									foreach($league_details as $league) {
										echo "<li>".$this->Html->link($league['Event']['name'], array(
											'controller' => $this->request->params['controller'], 
											'action' => $this->request->params['action'],
											implode(",", $this->request->pass),
											'?' => array(
												'gametype' => 'league',
												'centerID' => $league['Event']['center_id'],
												'leagueID' => $league['Event']['id'],
												'isComp' => 1
											)
										))."</li>";
									}
								}
							?>
						</ul>
					</li>
				</ul>
			</div>
			<hr>
			<div id="content">
				<?php echo $this->Session->flash(); ?>
				<?php echo $this->fetch('content'); ?>
				<div class="modal fade" id="mvpModal" tabindex="-1">
					<div class="modal-dialog modal-sm">
						<div class="modal-content">
							<div class="modal-header">
								<button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span></button>
								<h4 class="modal-title" id="mvpModalLabel">MVP Details</h4>
							</div>
							<div class="modal-body">
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
							</div>
						</div>
					</div>
				</div>
				<div class="modal fade" id="penaltyModal" tabindex="-1">
					<div class="modal-dialog modal-sm">
						<div class="modal-content">
							<div class="modal-header">
								<button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span></button>
								<h4 class="modal-title" id="penaltyModalLabel">Penalty Details</h4>
							</div>
							<div class="modal-body">
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
							</div>
						</div>
					</div>
				</div>
				<div class="modal fade" id="teamPenaltyModal" tabindex="-1">
					<div class="modal-dialog modal-sm">
						<div class="modal-content">
							<div class="modal-header">
								<button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span></button>
								<h4 class="modal-title" id="penaltyModalLabel">Team Penalty Details</h4>
							</div>
							<div class="modal-body">
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
							</div>
						</div>
					</div>
				</div>
				<div class="modal fade" id="hitModal" tabindex="-1">
					<div class="modal-dialog modal-md">
						<div class="modal-content">
							<div class="modal-header">
								<button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span></button>
								<h4 class="modal-title" id="hitModalLabel">Hit Details</h4>
							</div>
							<div class="modal-body">
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
							</div>
						</div>
					</div>
				</div>
				<div class="modal fade" id="matchModal" tabindex="-1">
					<div class="modal-dialog modal-md">
						<div class="modal-content">
							<div class="modal-header">
								<button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span></button>
								<h4 class="modal-title" id="matchModalLabel">Match Details</h4>
							</div>
							<div class="modal-body">
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
							</div>
						</div>
					</div>
				</div>

			</div>
			<div id="footer">
				<h6 class="text-center">
					<small>
						Players have shot each other <?=$scorecard_stats[0]['total_hits']; ?> times in <?=$game_stats[0]['total_games']; ?> games with <?=$scorecard_stats[0]['total_scorecards']; ?> individual scorecards.
					</small>
				</h6>
			</div>
		</div>
	</div>
	<script>
		$(document).ready(function() {
			$.ajax({ 
				url:'https://api.twitch.tv/kraken/streams/laserforcetournaments?client_id=5shofd1neum3sel2bzbaskcvyohfgz',
				dataType:'jsonp',
			}).done(function(channel) { 
				if(channel["stream"] == null) {
					$("#twitch_status").append(" <span class='label label-default'>Offline</span>");
				} else {
					$("#twitch_status").append(" <span class='label label-danger'>LIVE</span>");
				}
			});

			//global handlers for the various modals
			$('#penaltyModal').on('show.bs.modal', function (event) {
				var button = $(event.relatedTarget);
				$(this).find(".modal-body").text("Loading...");
				$(this).find(".modal-body").load(button.attr("target"));
			});
			$('#teamPenaltyModal').on('show.bs.modal', function (event) {
				var button = $(event.relatedTarget);
				$(this).find(".modal-body").text("Loading...");
				$(this).find(".modal-body").load(button.attr("target"));
			});
			$('#hitModal').on('show.bs.modal', function (event) {
				var button = $(event.relatedTarget);
				$(this).find(".modal-body").text("Loading...");
				$(this).find(".modal-body").load(button.attr("target"));
			});
			$('#matchModal').on('show.bs.modal', function (event) {
				var button = $(event.relatedTarget);
				$(this).find(".modal-body").text("Loading...");
				$(this).find(".modal-body").load(button.attr("target"));
			});
			$('#mvpModal').on('show.bs.modal', function (event) {
				var button = $(event.relatedTarget);
				$(this).find(".modal-body").text("Loading...");
				$(this).find(".modal-body").load(button.attr("target"));
			});
		});
	</script>
</body>
</html>
