<dl class="row">
    <dt class="col-sm-6 text-right text-nowrap">Team
    </dt>
    <dd class="col-sm-6 text-nowrap">
        <?php echo $team_penalty['TeamPenalty']['team_color'] ?>
    </dd class="col-sm-6 text-nowrap">
    <dt class="col-sm-6 text-right text-nowrap">Type
    </dt>
    <dd class="col-sm-6 text-nowrap">
        <?php echo h($team_penalty['TeamPenalty']['type']); ?>
    </dd>
    <dt class="col-sm-6 text-right text-nowrap">Description
    </dt>
    <dd class="col-sm-6 text-nowrap">
        <?php echo h($team_penalty['TeamPenalty']['description']); ?>
    </dd>
    <dt class="col-sm-6 text-right text-nowrap">Value
    </dt>
    <dd class="col-sm-6 text-nowrap">
        <?php echo h($team_penalty['TeamPenalty']['value']); ?>
    </dd>
</dl>
<?php if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $team_penalty['Game']['center_id'])): ?>
<a href=<?= $this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'edit', $team_penalty['TeamPenalty']['id'])); ?>
    class="btn btn-warning" role="button">Edit Penalty</a>
<?= $this->Html->link("Delete Penalty", array('controller' => 'TeamPenalties', 'action' => 'delete', $team_penalty['TeamPenalty']['id']), array('class' => 'btn btn-danger')); ?>
<?php endif;