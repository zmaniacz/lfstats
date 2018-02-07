<?php $this->log('modal', 'debug'); ?>
<dl class="dl-horizontal">
	<dt><?php echo __('Team'); ?></dt>
	<dd>
		<?php echo $team_penalty['TeamPenalty']['team_color'] ?>
	</dd>
	<dt><?php echo __('Type'); ?></dt>
	<dd>
		<?php echo h($team_penalty['TeamPenalty']['type']); ?>
	</dd>
	<dt><?php echo __('Description'); ?></dt>
	<dd>
		<?php echo h($team_penalty['TeamPenalty']['description']); ?>
	</dd>
	<dt><?php echo __('Score Value'); ?></dt>
	<dd>
		<?php echo h($team_penalty['TeamPenalty']['value']); ?>
	</dd>
</dl>
<?php if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $team_penalty['Game']['center_id'])): ?>
	<a href=<?= $this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'edit', $team_penalty['TeamPenalty']['id'])); ?> class="btn btn-warning" role="button">Edit Penalty</a>
	<?= $this->Html->link("Delete Penalty", array('controller' => 'TeamPenalties', 'action' => 'delete', $team_penalty['TeamPenalty']['id']), array('class' => 'btn btn-danger')); ?>
<?php endif; ?>