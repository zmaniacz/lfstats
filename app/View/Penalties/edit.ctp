<div id="penalty_edit" class="panel panel-primary">
    <div class="panel-heading" role="tab" id="penalty_edit_heading">
        <h4 class="panel-title">
            Edit Penalty
        </h4>
    </div>
    <div class="panel-body">
        <?php echo $this->Form->create('Penalty'); ?>
        <?php echo $this->Form->input('id', ['class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
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
        ]);
        ?>
        <?php echo $this->Form->input('description', ['class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
        <?php echo $this->Form->input('value', ['class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
        <?php echo $this->Form->input('mvp_value', ['class' => 'form-control', 'div' => ['class' => 'form-group']]); ?>
        <?php echo $this->Form->end(['value' => 'Submit', 'class' => 'btn btn-warning']); ?>
        <br />
        <?php echo $this->Form->postLink(__('Delete'), ['action' => 'delete', $this->Form->value('Penalty.id')], ['class' => 'btn btn-danger'], __('Are you sure you want to delete # %s?', $this->Form->value('Penalty.id'))); ?>
        </li>
    </div>
</div>