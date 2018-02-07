<div id="penalty_edit" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="penalty_edit_heading">
		<h4 class="panel-title">
			Edit Penalty
		</h4>
	</div>
	<div class="panel-body">
		<?php echo $this->Form->create('Penalty'); ?>
		<?= $this->Form->input('id', array('class' => 'form-control', 'div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->input('type', array(
				'options' => array(
					'Illegal Language' => 'Illegal Language',
					'Leaving Starting Area' => 'Leaving Starting Area',
					'Leaving Playing Arena' => 'Leaving Playing Arena',
					'Physical Abuse' => 'Physical Abuse',
					'Dangerous Play' => 'Dangerous Play',
					'Blocking' => 'Blocking',
					'Removing Equipment' => 'Removing Equipment',
					'Sitting or Lying' => 'Sitting or Lying',
					'Climbing' => 'Climbing',
					'Swapping Guns' => 'Swapping Guns',
					'Loitering' => 'Loitering',
					'Illegal Interaction' => 'Illegal Interaction',
					'Shielding' => 'Shielding',
					'Illegal Targeting' => 'Illegal Targeting',
					'Chasing' => 'Chasing',
					'Shoulder Tilting' => 'Shoulder Tilting',
					'Unsportsmanlike Conduct' => 'Unsportsmanlike Conduct',
					'Penalty Removed' => 'Penalty Removed',
					'Unknown' => 'Unknown'
				),
				'class' => 'form-control',
				'div' => array('class' => 'form-group')
			)); 
		?>
		<?= $this->Form->input('description', array('class' => 'form-control','div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->input('value', array('class' => 'form-control', 'div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->input('mvp_value', array('class' => 'form-control', 'div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->end(array('value' => 'Submit', 'class' => 'btn btn-warning')); ?>
		<br />
		<?= $this->Form->postLink(__('Delete'), array('action' => 'delete', $this->Form->value('Penalty.id')), array('class' => 'btn btn-danger'), __('Are you sure you want to delete # %s?', $this->Form->value('Penalty.id'))); ?></li>
	</div>
</div>
