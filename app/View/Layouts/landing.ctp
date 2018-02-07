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
	<script defer src='https://cdnjs.cloudflare.com/ajax/libs/highcharts/6.0.4/highcharts.js'></script>
	<script defer src='https://cdnjs.cloudflare.com/ajax/libs/highcharts/6.0.4/highcharts-more.js'></script>
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
	<div class="container" id="container">
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
		</div>
		<div id="content">
			<?php echo $this->Session->flash(); ?>
			<?php echo $this->fetch('content'); ?>
		</div>
		<div id="footer">
			<h6 class="text-center">
				<small>
					Players have shot each other <?=$scorecard_stats[0]['total_hits']; ?> times in <?=$game_stats[0]['total_games']; ?> games with <?=$scorecard_stats[0]['total_scorecards']; ?> individual scorecards.
				</small>
			</h6>
		</div>
	</div>
	<script>
		$(document).ready(function() {
			$.ajax({ 
				url:'https://api.twitch.tv/kraken/streams/laserforcetournaments?client_id=5shofd1neum3sel2bzbaskcvyohfgz',
				dataType:'jsonp',
				success:function(channel) { 
					if(channel["stream"] == null) {
						$("#twitch_status").append(" <span class='label label-default'>Offline</span>");
					} else {
						$("#twitch_status").append(" <span class='label label-danger'>LIVE</span>");
					}
				},
				error:function() {
					//request failed
				}
			});
		});
	</script>
</body>
</html>
