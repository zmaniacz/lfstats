<div id="team_penalty_add" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="team_penalty_add_heading">
		<h4 class="panel-title">
			Add Team Penalty
		</h4>
	</div>
	<div class="panel-body">
		<?php 
			echo $this->Form->create('TeamPenalty');
			echo $this->Form->input('type', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('description', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('value', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('team_color', array('type' => 'hidden', 'class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('game_id', array('type' => 'hidden', 'class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->end(array('value' => 'Submit', 'class' => 'btn btn-success'));
		?>
	</div>
</div>
