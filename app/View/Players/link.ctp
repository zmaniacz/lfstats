<?php if (isset($target_player)) { ?>
<div>
	<div class="alert alert-danger">WARNING: THIS IS A DESTRUCTIVE AND IRREVERSIBLE ACTION</div>
	Now linking <span style="color: red; font-weight: bold;"><?php echo $target_player['Player']['player_name']; ?></span>.
	<br />
	Choose a player below to make this player an alias of the selected player.

	<?php
    echo $this->Form->create();
    echo $this->Form->input('linked_id', ['type' => 'select', 'options' => $players, 'label' => '']);
    echo $this->Form->end('Link');
?>
</div>
<?php } else { ?>
<div>
	Here's some suggested links:
	<table class="table table-sm">
		<thead>
			<tr>
				<th>IPL Player</th>
				<th>Non-IPL Player</th>
				<th>Action</th>
			</tr>
		</thead>
		<tbody>
			<?php foreach ($links as $link) {
    $player = $this->Html->link($link[0]['master_name'], ['controller' => 'Players', 'action' => 'view', $link[0]['master_id']]);
    $target = $this->Html->link($link[0]['target_name'], ['controller' => 'Players', 'action' => 'view', $link[0]['target_id']]);
    $linkAction = $this->Html->link('Link', ['controller' => 'Players', 'action' => 'linkPlayers', $link[0]['master_id'], $link[0]['target_id']]);
    echo <<< HTML1
					<tr>
						<td>{$player}</td>
						<td>{$target}</td>
						<td>{$linkAction}</td>
					</tr>
				HTML1;
} ?>
		</tbody>
	</table>
</div>
<?php } ?>