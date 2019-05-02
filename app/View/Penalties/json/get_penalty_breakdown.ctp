<div class="card">
    <div class="card-body p-0 mb-2">
        <div class="table-responsive">
            <table class="table table-striped table-bordered table-hover table-sm m-0 text-nowrap">
                <thead>
                    <th>Type</th>
                    <th>Value</th>
                    <th>MVP Value</th>
                    <?php if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $penalty['Scorecard']['center_id'])): ?>
                    <th>Actions</th>
                    <?php endif; ?>
                </thead>
                <tbody>
                    <?php foreach ($penalties as $penalty): ?>
                    <tr>
                        <td>
                            <?= $penalty['Penalty']['type']; ?>
                        </td>
                        <td>
                            <?= $penalty['Penalty']['value']; ?>
                        </td>
                        <td>
                            <?= $penalty['Penalty']['mvp_value']; ?>
                        </td>
                        <?php if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $penalty['Scorecard']['center_id'])): ?>
                        <td>
                            <?= $this->Html->link("Rescind", array('controller' => 'penalties', 'action' => 'rescind', $penalty['Penalty']['id']), array('class' => 'btn btn-success')); ?>
                            <?=  $this->Html->link("Mark Common", array('controller' => 'penalties', 'action' => 'common', $penalty['Penalty']['id']), array('class' => 'btn btn-info')); ?>
                            <?=  $this->Html->link("Edit", array('controller' => 'penalties', 'action' => 'edit', $penalty['Penalty']['id']), array('class' => 'btn btn-warning')); ?>
                            <?=  $this->Html->link("Delete", array('controller' => 'penalties', 'action' => 'delete', $penalty['Penalty']['id']), array('class' => 'btn btn-danger')); ?>
                        </td>
                        <?php endif; ?>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>