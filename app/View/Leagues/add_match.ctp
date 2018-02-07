<div class="col-lg-7">
<div id="match_add" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="match_add_heading">
		<h4 class="panel-title">
			Add Match
		</h4>
	</div>
	<div class="panel-body">
		<h2><?= $league['Event']['name']; ?> - <?= ($round['Round']['is_finals']) ? "Finals" : "Round ".$round['Round']['round']; ?></h2>
		<?php
			echo $this->Form->create();
			echo $this->Form->hidden('round_id', array('value' => $round['Round']['id']));
			echo $this->Form->label('matches', "Enter the number of matches to add:");
			echo $this->Form->input('matches', array('class' => 'form-control','div' => array('class' => 'form-group')));
			echo $this->Form->end(array('value' => 'Submit', 'class' => 'btn btn-success'));
		?>
	</div>
</div></div>