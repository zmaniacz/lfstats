<div class="teamPenalties view">
<h2><?php echo __('Team Penalty'); ?></h2>
	<dl>
		<dt><?php echo __('Id'); ?></dt>
		<dd>
			<?php echo h($teamPenalty['TeamPenalty']['id']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Type'); ?></dt>
		<dd>
			<?php echo h($teamPenalty['TeamPenalty']['type']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Description'); ?></dt>
		<dd>
			<?php echo h($teamPenalty['TeamPenalty']['description']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Team Color'); ?></dt>
		<dd>
			<?php echo h($teamPenalty['TeamPenalty']['team_color']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Value'); ?></dt>
		<dd>
			<?php echo h($teamPenalty['TeamPenalty']['value']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Game'); ?></dt>
		<dd>
			<?php echo $this->Html->link($teamPenalty['Game']['id'], array('controller' => 'games', 'action' => 'view', $teamPenalty['Game']['id'])); ?>
			&nbsp;
		</dd>
	</dl>
</div>
<div class="actions">
	<h3><?php echo __('Actions'); ?></h3>
	<ul>
		<li><?php echo $this->Html->link(__('Edit Team Penalty'), array('action' => 'edit', $teamPenalty['TeamPenalty']['id'])); ?> </li>
		<li><?php echo $this->Form->postLink(__('Delete Team Penalty'), array('action' => 'delete', $teamPenalty['TeamPenalty']['id']), array('confirm' => __('Are you sure you want to delete # %s?', $teamPenalty['TeamPenalty']['id']))); ?> </li>
		<li><?php echo $this->Html->link(__('List Team Penalties'), array('action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Team Penalty'), array('action' => 'add')); ?> </li>
		<li><?php echo $this->Html->link(__('List Games'), array('controller' => 'games', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Game'), array('controller' => 'games', 'action' => 'add')); ?> </li>
	</ul>
</div>
