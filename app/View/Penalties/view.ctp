<div id="penalty_view" class="panel panel-primary">
	<div class="panel-heading" role="tab" id="penalty_view_heading">
		<h4 class="panel-title">
			Penalty Details
		</h4>
	</div>
	<div class="panel-body">
		<dl class="dl-horizontal">
			<dt><?php echo __('Player'); ?></dt>
			<dd>
				<?php echo $this->Html->link(h($penalty['Scorecard']['Player']['player_name']), array('controller' => 'Players', 'action' => 'view', $penalty['Scorecard']['Player']['id'])); ?>
				&nbsp;
			</dd>
			<dt><?php echo __('Type'); ?></dt>
			<dd>
				<?php echo h($penalty['Penalty']['type']); ?>
				&nbsp;
			</dd>
			<dt><?php echo __('Description'); ?></dt>
			<dd>
				<?php echo h($penalty['Penalty']['description']); ?>
				&nbsp;
			</dd>
			<dt><?php echo __('Score Value'); ?></dt>
			<dd>
				<?php echo h($penalty['Penalty']['value']); ?>
				&nbsp;
			</dd>
			<dt><?php echo __('MVP Value'); ?></dt>
			<dd>
				<?php echo h($penalty['Penalty']['mvp_value']); ?>
				&nbsp;
			</dd>
			<dt><?php echo __('Game'); ?></dt>
			<dd>
				<?php echo $this->Html->link(h($penalty['Scorecard']['Game']['game_name'])." ".h($penalty['Scorecard']['Game']['game_datetime']), array('controller' => 'Games', 'action' => 'view', $penalty['Scorecard']['Game']['id'])); ?>
				&nbsp;
			</dd>
		</dl>
	</div>
</div>
<?php if(AuthComponent::user('role') === 'admin'): ?>
<a href=<?= $this->Html->url(array('action' => 'edit', $penalty['Penalty']['id'])); ?> class="btn btn-warning" role="button">Edit Penalty</a>
<?= $this->Form->postLink(__('Delete Penalty'), array('action' => 'delete', $penalty['Penalty']['id']), array('class' => 'btn btn-danger'), __('Are you sure you want to delete # %s?', $penalty['Penalty']['id'])); ?>
<?php endif; ?>
