<?php echo $this->Form->create('Event'); ?>
<fieldset>
    <legend><?php echo __('Edit Event'); ?>
    </legend>
    <?php
        echo $this->Form->input('id');
        echo $this->Form->input('name', array(
            'div' => 'form-group',
            'class' => 'form-control'
        ));
        echo $this->Form->input('description', array(
            'div' => 'form-group',
            'class' => 'form-control'
        ));
        echo $this->Form->input('center_id', array(
            'div' => 'form-group',
            'class' => 'form-control'
        ));
        echo $this->Form->input('penalty_point_value', array(
            'div' => 'form-group',
            'class' => 'form-control'
        ));
        echo $this->Form->input('penalty_mvp_value', array(
            'div' => 'form-group',
            'class' => 'form-control'
        ));
        echo $this->Form->input('penalty_default_type', array(
            'div' => 'form-group',
            'class' => 'form-control'
        ));
    ?>
</fieldset>
<button type="submit" class="btn btn-primary mb-2">Submit</button>
<?php echo $this->Form->end();