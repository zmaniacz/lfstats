<div id="penalties_list" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="overall_heading">
		<h4 class="panel-title">
			Penalties
		</h4>
	</div>
	<div class="panel-body">
			<table class="display table table-striped table-bordered table-hover" id="penalties_table">
				<thead>
					<th>Game</th>
					<th>Date/Time</th>
					<th>Player</th>
					<th>Type</th>
					<th>Value</th>
					<th>MVP Value</th>
					<th>Actions</th>
				</thead>
				<?php foreach ($penalties as $penalty): ?>
					<?php
						if(!empty($penalty['Scorecard']['Game']['Match'])) {
							if($penalty['Scorecard']['Game']['Match']['Round']['is_finals']) {
								$game_name = "Finals ";
							} else {
								$game_name = "R".$penalty['Scorecard']['Game']['Match']['Round']['round']." ";
							}
							$game_name .= "M".$penalty['Scorecard']['Game']['Match']['match']." G".$penalty['Scorecard']['Game']['league_game'];

							if(!empty($penalty['Scorecard']['Game']['Red_Team'] && !empty($penalty['Scorecard']['Game']['Green_Team']))) {
								$game_name .= " ".$penalty['Scorecard']['Game']['Red_Team']['name']." v ".$penalty['Scorecard']['Game']['Green_Team']['name'];
							}
						} else {
							$game_name = $penalty['Scorecard']['Game']['game_name']." ".$penalty['Scorecard']['Game']['game_datetime'];
						}
					?>
					<tr>
						<td><?php echo $this->Html->link($game_name, array('controller' => 'games', 'action' => 'view', $penalty['Scorecard']['Game']['id'])); ?>&nbsp;</td>
						<td><?php echo $penalty['Scorecard']['Game']['game_datetime']; ?></td>
						<td>
							<?php echo $this->Html->link($penalty['Scorecard']['Player']['player_name'], array('controller' => 'players', 'action' => 'view', $penalty['Scorecard']['Player']['id'])); ?>
						</td>	
						<td><?php echo h($penalty['Penalty']['type']); ?>&nbsp;</td>
						<td><?php echo h($penalty['Penalty']['value']); ?>&nbsp;</td>
						<td><?php echo h($penalty['Penalty']['mvp_value']); ?>&nbsp;</td>
						<td class="actions">
							<?php echo $this->Html->link(__('View'), array('action' => 'view', $penalty['Penalty']['id']), array('class' => 'btn btn-primary')); ?>
							<?php 
								if(AuthComponent::user('role') === 'admin') {
									echo $this->Html->link(__('Edit'), array('action' => 'edit', $penalty['Penalty']['id']), array('class' => 'btn btn-warning'));
									echo $this->Form->postLink(__('Delete'), array('action' => 'delete', $penalty['Penalty']['id']), array('class' => 'btn btn-danger'), __('Are you sure you want to delete # %s?', $penalty['Penalty']['id']));
								}
							?>
						</td>
					</tr>
				<?php endforeach; ?>
			</table>
		</div>
	</div>
</div>
<script type="text/javascript">
	$(document).ready(function() {
		$('.display').DataTable( {
			"order": [[1, "desc"]]
		} );
	} );
</script>