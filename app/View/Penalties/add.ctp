<div id="penalty_add" class="panel panel-primary">
    <div class="panel-heading" role="tab" id="penalty_add_heading">
        <h4 class="panel-title">
            Add Penalty
        </h4>
    </div>
    <div class="panel-body">
        <?php echo $this->Form->create('Penalty'); ?>
        <?php echo $this->Form->input('type', [
            'options' => [
                'Common Foul' => 'Common Foul',
                'Shielding' => 'Shielding',
                'Chasing' => 'Chasing',
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
                'Illegal Targeting' => 'Illegal Targeting',
                'Shoulder Tilting' => 'Shoulder Tilting',
                'Unsportsmanlike Conduct' => 'Unsportsmanlike Conduct',
                'Game Misconduct' => 'Game Misconduct',
                'Penalty Removed' => 'Penalty Removed',
                'Unknown' => 'Unknown',
            ],
            'class' => 'form-control',
            'div' => ['class' => 'form-group'],
        ]); ?>
        <?php echo $this->Form->input('description', ['class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
        <?php echo $this->Form->input('value', ['default' => '-1000', 'class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
        <?php echo $this->Form->input('mvp_value', ['default' => '-5', 'class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
        <?php echo $this->Form->input('scorecard_id', ['class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
        <?php echo $this->Form->end(['value' => 'Submit', 'class' => 'btn btn-success']); ?>
    </div>
</div>