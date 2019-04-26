<h4 class="panel-title">
    Penalties
</h4>

<table class="display table table-striped table-bordered table-hover" id="penalties_table">
    <thead>
        <th>Game</th>
        <th>Date/Time</th>
        <th>Player</th>
        <th>Type</th>
        <th>Value</th>
        <th>MVP Value</th>
        <th>Actions</th>
    </thead>
    <tbody>
        <?php foreach ($penalties as $penalty): ?>
        <?php
                        if (!empty($penalty['Scorecard']['Game']['Match'])) {
                            if ($penalty['Scorecard']['Game']['Match']['Round']['is_finals']) {
                                $game_name = "Finals ";
                            } else {
                                $game_name = "R".$penalty['Scorecard']['Game']['Match']['Round']['round']." ";
                            }
                            $game_name .= "M".$penalty['Scorecard']['Game']['Match']['match']." G".$penalty['Scorecard']['Game']['league_game'];

                            if (!empty($penalty['Scorecard']['Game']['Red_Team'] && !empty($penalty['Scorecard']['Game']['Green_Team']))) {
                                $game_name .= " ".$penalty['Scorecard']['Game']['Red_Team']['name']." v ".$penalty['Scorecard']['Game']['Green_Team']['name'];
                            }
                        } else {
                            $game_name = $penalty['Scorecard']['Game']['game_name']." ".$penalty['Scorecard']['Game']['game_datetime'];
                        }
                    ?>
        <tr>
            <td><?php echo $this->Html->link($game_name, array('controller' => 'games', 'action' => 'view', $penalty['Scorecard']['Game']['id'])); ?>&nbsp;
            </td>
            <td><?php echo $penalty['Scorecard']['Game']['game_datetime']; ?>
            </td>
            <td>
                <?php echo $this->Html->link($penalty['Scorecard']['Player']['player_name'], array('controller' => 'players', 'action' => 'view', $penalty['Scorecard']['Player']['id'])); ?>
            </td>
            <td><?php echo h($penalty['Penalty']['type']); ?>&nbsp;
            </td>
            <td><?php echo h($penalty['Penalty']['value']); ?>&nbsp;
            </td>
            <td><?php echo h($penalty['Penalty']['mvp_value']); ?>&nbsp;
            </td>
            <td class="actions">
                <?php
                        if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $penalty['Scorecard']['Game']['center_id'])) {
                            echo $this->Html->link("Rescind", array('controller' => 'penalties', 'action' => 'rescind', $penalty['Penalty']['id']), array('class' => 'btn btn-success'));
                            echo $this->Html->link("Common", array('controller' => 'penalties', 'action' => 'common', $penalty['Penalty']['id']), array('class' => 'btn btn-info'));
                            echo $this->Html->link("Edit", array('controller' => 'penalties', 'action' => 'edit', $penalty['Penalty']['id']), array('class' => 'btn btn-warning'));
                            echo $this->Html->link("Delete", array('controller' => 'penalties', 'action' => 'delete', $penalty['Penalty']['id']), array('class' => 'btn btn-danger'), array('confirm' => 'Are you sure you want to delete this penalty?'));
                        }
                    ?>
            </td>
        </tr>
        <?php endforeach; ?>
    <tbody>
</table>

<script type="text/javascript">
$(document).ready(function() {
    $('.display').DataTable({
        "order": [
            [1, "asc"]
        ]
    });
});
</script>