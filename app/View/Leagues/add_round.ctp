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
			echo $this->Form->hidden('event_id', array('value' => $this->Session->read('state.leagueID')));
			echo $this->Form->input('round', array('class' => 'form-control','label' => 'Round','div' => array('class' => 'mb-3')));
			echo $this->Form->input('is_finals', array('type' => 'checkbox', 'class' => 'form-check-input','label' => 'Finals?','div' => array('class' => 'mb-3')));
			echo $this->Form->end(array('value' => 'Submit', 'class' => 'btn btn-success'));
		?>
	</div>
</div></div>