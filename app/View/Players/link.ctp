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