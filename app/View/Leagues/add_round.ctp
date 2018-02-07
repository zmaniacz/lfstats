<div class="col-lg-7">
<div id="round_add" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="round_add_heading">
		<h4 class="panel-title">
			Add Round
		</h4>
	</div>
	<div class="panel-body">
		<?php
			echo $this->Form->create('Round');
			echo $this->Form->hidden('league_id', array('value' => $this->Session->read('state.leagueID')));
			echo $this->Form->input('round', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->label('is_finals', 'Finals');
			echo $this->Form->checkbox('is_finals', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->end(array('value' => 'Submit', 'class' => 'btn btn-success'));
		?>
	</div>
</div></div>