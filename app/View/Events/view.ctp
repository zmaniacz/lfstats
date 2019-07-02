<div class="events view">
<h2><?php echo __('Event'); ?></h2>
	<dl>
		<dt><?php echo __('Id'); ?></dt>
		<dd>
			<?php echo h($event['Event']['id']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Name'); ?></dt>
		<dd>
			<?php echo h($event['Event']['name']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Description'); ?></dt>
		<dd>
			<?php echo h($event['Event']['description']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Type'); ?></dt>
		<dd>
			<?php echo h($event['Event']['type']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Is Comp'); ?></dt>
		<dd>
			<?php echo h($event['Event']['is_comp']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Center'); ?></dt>
		<dd>
			<?php echo $this->Html->link($event['Center']['name'], array('controller' => 'centers', 'action' => 'view', $event['Center']['id'])); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Challonge Id'); ?></dt>
		<dd>
			<?php echo h($event['Event']['challonge_id']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Challonge Link'); ?></dt>
		<dd>
			<?php echo h($event['Event']['challonge_link']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Penalty Point Value'); ?></dt>
		<dd>
			<?php echo h($event['Event']['penalty_point_value']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Penalty Mvp Value'); ?></dt>
		<dd>
			<?php echo h($event['Event']['penalty_mvp_value']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Penalty Default Type'); ?></dt>
		<dd>
			<?php echo h($event['Event']['penalty_default_type']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Created'); ?></dt>
		<dd>
			<?php echo h($event['Event']['created']); ?>
			&nbsp;
		</dd>
		<dt><?php echo __('Modified'); ?></dt>
		<dd>
			<?php echo h($event['Event']['modified']); ?>
			&nbsp;
		</dd>
	</dl>
</div>
<div class="actions">
	<h3><?php echo __('Actions'); ?></h3>
	<ul>
		<li><?php echo $this->Html->link(__('Edit Event'), array('action' => 'edit', $event['Event']['id'])); ?> </li>
		<li><?php echo $this->Form->postLink(__('Delete Event'), array('action' => 'delete', $event['Event']['id']), array('confirm' => __('Are you sure you want to delete # %s?', $event['Event']['id']))); ?> </li>
		<li><?php echo $this->Html->link(__('List Events'), array('action' => 'index')); ?> </li>
		<li><?php echo $this->Html->link(__('New Event'), array('action' => 'add')); ?> </li>
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
<div class="related">
	<h3><?php echo __('Related Games'); ?></h3>
	<?php if (!empty($event['Game'])): ?>
	<table cellpadding = "0" cellspacing = "0">
	<tr>
		<th><?php echo __('Id'); ?></th>
		<th><?php echo __('Game Name'); ?></th>
		<th><?php echo __('Game Description'); ?></th>
		<th><?php echo __('Game Datetime'); ?></th>
		<th><?php echo __('Game Length'); ?></th>
		<th><?php echo __('Green Team Id'); ?></th>
		<th><?php echo __('Red Team Id'); ?></th>
		<th><?php echo __('Red Score'); ?></th>
		<th><?php echo __('Green Score'); ?></th>
		<th><?php echo __('Red Adj'); ?></th>
		<th><?php echo __('Green Adj'); ?></th>
		<th><?php echo __('Winner'); ?></th>
		<th><?php echo __('Red Eliminated'); ?></th>
		<th><?php echo __('Green Eliminated'); ?></th>
		<th><?php echo __('Type'); ?></th>
		<th><?php echo __('League Round'); ?></th>
		<th><?php echo __('League Match'); ?></th>
		<th><?php echo __('League Game'); ?></th>
		<th><?php echo __('Pdf Id'); ?></th>
		<th><?php echo __('Center Id'); ?></th>
		<th><?php echo __('Event Id'); ?></th>
		<th><?php echo __('Match Id'); ?></th>
		<th><?php echo __('Created'); ?></th>
		<th><?php echo __('Modified'); ?></th>
		<th class="actions"><?php echo __('Actions'); ?></th>
	</tr>
	<?php foreach ($event['Game'] as $game): ?>
		<tr>
			<td><?php echo $game['id']; ?></td>
			<td><?php echo $game['game_name']; ?></td>
			<td><?php echo $game['game_description']; ?></td>
			<td><?php echo $game['game_datetime']; ?></td>
			<td><?php echo $game['game_length']; ?></td>
			<td><?php echo $game['green_team_id']; ?></td>
			<td><?php echo $game['red_team_id']; ?></td>
			<td><?php echo $game['red_score']; ?></td>
			<td><?php echo $game['green_score']; ?></td>
			<td><?php echo $game['red_adj']; ?></td>
			<td><?php echo $game['green_adj']; ?></td>
			<td><?php echo $game['winner']; ?></td>
			<td><?php echo $game['red_eliminated']; ?></td>
			<td><?php echo $game['green_eliminated']; ?></td>
			<td><?php echo $game['type']; ?></td>
			<td><?php echo $game['league_round']; ?></td>
			<td><?php echo $game['league_match']; ?></td>
			<td><?php echo $game['league_game']; ?></td>
			<td><?php echo $game['pdf_id']; ?></td>
			<td><?php echo $game['center_id']; ?></td>
			<td><?php echo $game['event_id']; ?></td>
			<td><?php echo $game['match_id']; ?></td>
			<td><?php echo $game['created']; ?></td>
			<td><?php echo $game['modified']; ?></td>
			<td class="actions">
				<?php echo $this->Html->link(__('View'), array('controller' => 'games', 'action' => 'view', $game['id'])); ?>
				<?php echo $this->Html->link(__('Edit'), array('controller' => 'games', 'action' => 'edit', $game['id'])); ?>
				<?php echo $this->Form->postLink(__('Delete'), array('controller' => 'games', 'action' => 'delete', $game['id']), array('confirm' => __('Are you sure you want to delete # %s?', $game['id']))); ?>
			</td>
		</tr>
	<?php endforeach; ?>
	</table>
<?php endif; ?>

	<div class="actions">
		<ul>
			<li><?php echo $this->Html->link(__('New Game'), array('controller' => 'games', 'action' => 'add')); ?> </li>
		</ul>
	</div>
</div>
<div class="related">
	<h3><?php echo __('Related Event Teams'); ?></h3>
	<?php if (!empty($event['EventTeam'])): ?>
	<table cellpadding = "0" cellspacing = "0">
	<tr>
		<th><?php echo __('Id'); ?></th>
		<th><?php echo __('Name'); ?></th>
		<th><?php echo __('Points'); ?></th>
		<th><?php echo __('Country Code'); ?></th>
		<th><?php echo __('Event Id'); ?></th>
		<th><?php echo __('Challonge Id'); ?></th>
		<th><?php echo __('Created'); ?></th>
		<th><?php echo __('Modified'); ?></th>
		<th class="actions"><?php echo __('Actions'); ?></th>
	</tr>
	<?php foreach ($event['EventTeam'] as $eventTeam): ?>
		<tr>
			<td><?php echo $eventTeam['id']; ?></td>
			<td><?php echo $eventTeam['name']; ?></td>
			<td><?php echo $eventTeam['points']; ?></td>
			<td><?php echo $eventTeam['country_code']; ?></td>
			<td><?php echo $eventTeam['event_id']; ?></td>
			<td><?php echo $eventTeam['challonge_id']; ?></td>
			<td><?php echo $eventTeam['created']; ?></td>
			<td><?php echo $eventTeam['modified']; ?></td>
			<td class="actions">
				<?php echo $this->Html->link(__('View'), array('controller' => 'event_teams', 'action' => 'view', $eventTeam['id'])); ?>
				<?php echo $this->Html->link(__('Edit'), array('controller' => 'event_teams', 'action' => 'edit', $eventTeam['id'])); ?>
				<?php echo $this->Form->postLink(__('Delete'), array('controller' => 'event_teams', 'action' => 'delete', $eventTeam['id']), array('confirm' => __('Are you sure you want to delete # %s?', $eventTeam['id']))); ?>
			</td>
		</tr>
	<?php endforeach; ?>
	</table>
<?php endif; ?>

	<div class="actions">
		<ul>
			<li><?php echo $this->Html->link(__('New Event Team'), array('controller' => 'event_teams', 'action' => 'add')); ?> </li>
		</ul>
	</div>
</div>
<div class="related">
	<h3><?php echo __('Related Rounds'); ?></h3>
	<?php if (!empty($event['Round'])): ?>
	<table cellpadding = "0" cellspacing = "0">
	<tr>
		<th><?php echo __('Id'); ?></th>
		<th><?php echo __('Round'); ?></th>
		<th><?php echo __('Is Finals'); ?></th>
		<th><?php echo __('Event Id'); ?></th>
		<th><?php echo __('Created'); ?></th>
		<th><?php echo __('Modified'); ?></th>
		<th class="actions"><?php echo __('Actions'); ?></th>
	</tr>
	<?php foreach ($event['Round'] as $round): ?>
		<tr>
			<td><?php echo $round['id']; ?></td>
			<td><?php echo $round['round']; ?></td>
			<td><?php echo $round['is_finals']; ?></td>
			<td><?php echo $round['event_id']; ?></td>
			<td><?php echo $round['created']; ?></td>
			<td><?php echo $round['modified']; ?></td>
			<td class="actions">
				<?php echo $this->Html->link(__('View'), array('controller' => 'rounds', 'action' => 'view', $round['id'])); ?>
				<?php echo $this->Html->link(__('Edit'), array('controller' => 'rounds', 'action' => 'edit', $round['id'])); ?>
				<?php echo $this->Form->postLink(__('Delete'), array('controller' => 'rounds', 'action' => 'delete', $round['id']), array('confirm' => __('Are you sure you want to delete # %s?', $round['id']))); ?>
			</td>
		</tr>
	<?php endforeach; ?>
	</table>
<?php endif; ?>

	<div class="actions">
		<ul>
			<li><?php echo $this->Html->link(__('New Round'), array('controller' => 'rounds', 'action' => 'add')); ?> </li>
		</ul>
	</div>
</div>
