<div class="teamPenalties index">
	<h2><?php echo __('Team Penalties'); ?></h2>
	<table cellpadding="0" cellspacing="0">
	<thead>
	<tr>
			<th><?php echo $this->Paginator->sort('id'); ?></th>
			<th><?php echo $this->Paginator->sort('type'); ?></th>
			<th><?php echo $this->Paginator->sort('description'); ?></th>
			<th><?php echo $this->Paginator->sort('team_color'); ?></th>
			<th><?php echo $this->Paginator->sort('value'); ?></th>
			<th><?php echo $this->Paginator->sort('game_id'); ?></th>
			<th class="actions"><?php echo __('Actions'); ?></th>
	</tr>
	</thead>
	<tbody>
	<?php foreach ($teamPenalties as $teamPenalty): ?>
	<tr>
		<td><?php echo h($teamPenalty['TeamPenalty']['id']); ?>&nbsp;</td>
		<td><?php echo h($teamPenalty['TeamPenalty']['type']); ?>&nbsp;</td>
		<td><?php echo h($teamPenalty['TeamPenalty']['description']); ?>&nbsp;</td>
		<td><?php echo h($teamPenalty['TeamPenalty']['team_color']); ?>&nbsp;</td>
		<td><?php echo h($teamPenalty['TeamPenalty']['value']); ?>&nbsp;</td>
		<td>
			<?php echo $this->Html->link($teamPenalty['Game']['id'], array('controller' => 'games', 'action' => 'view', $teamPenalty['Game']['id'])); ?>
		</td>
		<td class="actions">
			<?php echo $this->Html->link(__('View'), array('action' => 'view', $teamPenalty['TeamPenalty']['id'])); ?>
			<?php echo $this->Html->link(__('Edit'), array('action' => 'edit', $teamPenalty['TeamPenalty']['id'])); ?>
			<?php echo $this->Form->postLink(__('Delete'), array('action' => 'delete', $teamPenalty['TeamPenalty']['id']), array('confirm' => __('Are you sure you want to delete # %s?', $teamPenalty['TeamPenalty']['id']))); ?>
		</td>
	</tr>
<?php endforeach; ?>
	</tbody>
	</table>
	<p>
	<?php
	echo $this->Paginator->counter(array(
		'format' => __('Page {:page} of {:pages}, showing {:current} records out of {:count} total, starting on record {:start}, ending on {:end}')
	));
	?>	</p>
	<div class="paging">
	<?php
		echo $this->Paginator->prev('< ' . __('previous'), array(), null, array('class' => 'prev disabled'));
		echo $this->Paginator->numbers(array('separator' => ''));
		echo $this->Paginator->next(__('next') . ' >', array(), null, array('class' => 'next disabled'));
	?>
	</div>
</div>
<div class="actions">
	<h3><?php echo __('Actions'); ?></h3>
	<ul>
		<li><?php echo $this->Html->link(__('New Team Penalty'), array('action' => 'add')); ?></li>
		<li><?php echo $this->Html->link(__('List Games'), array('controller' => 'games', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Game'), array('controller' => 'games', 'action' => 'add')); ?> </li>
	</ul>
</div>
