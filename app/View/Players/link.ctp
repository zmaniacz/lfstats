<p>
	Now linking <span style="color: red; font-weight: bold;"><?php echo $target_player['Player']['player_name']; ?></span>.  Choose a player below to make this player an alias of the selected player.
<?php
	echo $this->Form->create();
	echo $this->Form->input('linked_id', array('type' => 'select', 'options' => $players, 'label' => ''));
	echo $this->Form->end('Link');
?>
</p>