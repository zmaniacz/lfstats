<div class="events form">
<?php echo $this->Form->create('Event'); ?>
	<fieldset>
		<legend><?php echo __('Add Event'); ?></legend>
	<?php
		echo $this->Form->input('name');
		echo $this->Form->input('description');
		echo $this->Form->input('type');
		echo $this->Form->input('is_comp');
		echo $this->Form->input('center_id');
		echo $this->Form->input('challonge_id');
		echo $this->Form->input('challonge_link');
		echo $this->Form->input('penalty_point_value');
		echo $this->Form->input('penalty_mvp_value');
		echo $this->Form->input('penalty_default_type');
	?>
	</fieldset>
<?php echo $this->Form->end(__('Submit')); ?>
</div>
<div class="actions">
	<h3><?php echo __('Actions'); ?></h3>
	<ul>

		<li><?php echo $this->Html->link(__('List Events'), array('action' => 'index')); ?></li>
		<li><?php echo $this->Html->link(__('List Centers'), array('controller' => 'centers', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Center'), array('controller' => 'centers', 'action' => 'add')); ?> </li>
		<li><?php echo $this->Html->link(__('List Games'), array('controller' => 'games', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Game'), array('controller' => 'games', 'action' => 'add')); ?> </li>
		<li><?php echo $this->Html->link(__('List Event Teams'), array('controller' => 'event_teams', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Event Team'), array('controller' => 'event_teams', 'action' => 'add')); ?> </li>
		<li><?php echo $this->Html->link(__('List Rounds'), array('controller' => 'rounds', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Round'), array('controller' => 'rounds', 'action' => 'add')); ?> </li>
	</ul>
</div>
