<?php echo $this->Form->create('Event'); ?>
<div class="form-group">
    <?php
        echo $this->Form->input('id');
        echo $this->Form->input('name', [
            'class' => 'form-control',
        ]);
        echo $this->Form->input('description', [
            'class' => 'form-control',
        ]);
        echo $this->Form->input('scoring', [
            'class' => 'form-control',
            'options' => ['solo' => 'solo', 'team' => 'team'],
        ]);
        echo $this->Form->input('center_id', [
            'class' => 'form-control',
        ]);
        echo $this->Form->input('penalty_point_value', [
            'class' => 'form-control',
        ]);
        echo $this->Form->input('penalty_mvp_value', [
            'class' => 'form-control',
        ]);
        echo $this->Form->input('penalty_default_type', [
            'class' => 'form-control',
        ]);
        echo $this->Form->input('enable_top_players', [
            'div' => 'custom-control custom-switch',
            'class' => 'custom-control-input',
            'label' => [
                'class' => 'custom-control-label',
                'text' => 'Enable Top Players',
            ],
        ]);
        echo $this->Form->input('enable_leaderboards', [
            'div' => 'custom-control custom-switch',
            'class' => 'custom-control-input',
            'label' => [
                'class' => 'custom-control-label',
                'text' => 'Enable Leaderboards',
            ],
        ]);
        echo $this->Form->input('enable_allstar', [
            'div' => 'custom-control custom-switch',
            'class' => 'custom-control-input',
            'label' => [
                'class' => 'custom-control-label',
                'text' => 'Enable All-Star',
            ],
        ]);
        echo $this->Form->input('enable_player_stats', [
            'div' => 'custom-control custom-switch',
            'class' => 'custom-control-input',
            'label' => [
                'class' => 'custom-control-label',
                'text' => 'Enable Player Stats',
            ],
        ]);
    ?>
</div>
<button type="submit" class="btn btn-primary mb-2">Submit</button>
<?php echo $this->Form->end();
