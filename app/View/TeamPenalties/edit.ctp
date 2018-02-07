<div id="team_penalty_edit" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="team_penalty_edit_heading">
		<h4 class="panel-title">
			Edit Team Penalty
		</h4>
	</div>
	<div class="panel-body">
		<?php 
			echo $this->Form->create('TeamPenalty');
			echo $this->Form->input('id', array('class' => 'form-control', 'div' => array('class' => 'form-group')));
			echo $this->Form->input('type', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('description', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('value', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('team_color', array('type' => 'hidden', 'class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('game_id', array('type' => 'hidden', 'class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->end(array('value' => 'Submit', 'class' => 'btn btn-success'));
		?>
		<?= $this->Form->postLink(__('Delete'), array('action' => 'delete', $this->Form->value('TeamPenalty.id')), array('class' => 'btn btn-danger'), __('Are you sure you want to delete # %s?', $this->Form->value('TeamPenalty.id'))); ?></li>
	</div>
</div>
