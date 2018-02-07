<div id="penalty_add" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="penalty_add_heading">
		<h4 class="panel-title">
			Add Penalty
		</h4>
	</div>
	<div class="panel-body">
		<?= $this->Form->create('Penalty'); ?>
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
		)); ?>
		<?= $this->Form->input('description', array('class' => 'form-control','div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->input('value', array('default' => '-1000', 'class' => 'form-control', 'div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->input('mvp_value', array('default' => '-5', 'class' => 'form-control', 'div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->input('scorecard_id', array('class' => 'form-control', 'div' => array('class' => 'form-group'))); ?>
		<?= $this->Form->end(array('value' => 'Submit', 'class' => 'btn btn-success')); ?>
	</div>
</div>
