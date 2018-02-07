<div id="team_add" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="team_add_heading">
		<h4 class="panel-title">
			Add Team
		</h4>
	</div>
	<div class="panel-body">
		<?php
			echo $this->Form->create('Team');
			echo $this->Form->input('name', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->input('league_id', array('class' => 'form-control','div' => array('class' => 'form-group')));
			//echo $this->Form->input('captain_id', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->end('Submit');
		?>
	</div>
</div>