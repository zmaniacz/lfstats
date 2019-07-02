<div class="events index">
	<h2><?php echo __('Events'); ?></h2>
	<table cellpadding="0" cellspacing="0">
	<thead>
	<tr>
			<th><?php echo $this->Paginator->sort('id'); ?></th>
			<th><?php echo $this->Paginator->sort('name'); ?></th>
			<th><?php echo $this->Paginator->sort('description'); ?></th>
			<th><?php echo $this->Paginator->sort('type'); ?></th>
			<th><?php echo $this->Paginator->sort('is_comp'); ?></th>
			<th><?php echo $this->Paginator->sort('center_id'); ?></th>
			<th><?php echo $this->Paginator->sort('challonge_id'); ?></th>
			<th><?php echo $this->Paginator->sort('challonge_link'); ?></th>
			<th><?php echo $this->Paginator->sort('penalty_point_value'); ?></th>
			<th><?php echo $this->Paginator->sort('penalty_mvp_value'); ?></th>
			<th><?php echo $this->Paginator->sort('penalty_default_type'); ?></th>
			<th><?php echo $this->Paginator->sort('created'); ?></th>
			<th><?php echo $this->Paginator->sort('modified'); ?></th>
			<th class="actions"><?php echo __('Actions'); ?></th>
	</tr>
	</thead>
	<tbody>
	<?php foreach ($events as $event): ?>
	<tr>
		<td><?php echo h($event['Event']['id']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['name']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['description']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['type']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['is_comp']); ?>&nbsp;</td>
		<td>
			<?php echo $this->Html->link($event['Center']['name'], array('controller' => 'centers', 'action' => 'view', $event['Center']['id'])); ?>
		</td>
		<td><?php echo h($event['Event']['challonge_id']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['challonge_link']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['penalty_point_value']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['penalty_mvp_value']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['penalty_default_type']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['created']); ?>&nbsp;</td>
		<td><?php echo h($event['Event']['modified']); ?>&nbsp;</td>
		<td class="actions">
			<?php echo $this->Html->link(__('View'), array('action' => 'view', $event['Event']['id'])); ?>
			<?php echo $this->Html->link(__('Edit'), array('action' => 'edit', $event['Event']['id'])); ?>
			<?php echo $this->Form->postLink(__('Delete'), array('action' => 'delete', $event['Event']['id']), array('confirm' => __('Are you sure you want to delete # %s?', $event['Event']['id']))); ?>
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
		<li><?php echo $this->Html->link(__('New Event'), array('action' => 'add')); ?></li>
		<li><?php echo $this->Html->link(__('List Centers'), array('controller' => 'centers', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Center'), array('controller' => 'centers', 'action' => 'add')); ?> </li>
		<li><?php echo $this->Html->link(__('List Games'), array('controller' => 'games', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Game'), array('controller' => 'games', 'action' => 'add')); ?> </li>
		<li><?php echo $this->Html->link(__('List Event Teams'), array('controller' => 'event_teams', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Event Team'), array('controller' => 'event_teams', 'action' => 'add')); ?> </li>
		<li><?php echo $this->Html->link(__('List Rounds'), array('controller' => 'rounds', 'action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Round'), array('controller' => 'rounds', 'action' => 'add')); ?> </li>
	</ul>
</div>
