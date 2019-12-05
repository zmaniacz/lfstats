<?php
    if (!empty($hits)) {
        $green_table = '';
        $red_table = '';
        foreach ($hits as $hit) {
            if ($hit['player_id'] != $player_id) {
                if ('green' == $hit['team']) {
                    $green_line = '<tr>';

                    $green_line .= '<td>'.$hit['player_name'].'</td>';
                    $green_line .= '<td>'.$hit['position'].'</td>';
                    $green_line .= '<td>'.$hit['hit'].'</td>';
                    $green_line .= '<td>'.$hit['hitBy'].'</td>';
                    $green_line .= '<td>'.$hit['missile'].'</td>';
                    $green_line .= '<td>'.$hit['missileBy'].'</td>';

                    $green_line .= '</tr>';

                    $green_table .= $green_line;
                } else {
                    $red_line = '<tr>';

                    $red_line .= '<td>'.$hit['player_name'].'</td>';
                    $red_line .= '<td>'.$hit['position'].'</td>';
                    $red_line .= '<td>'.$hit['hit'].'</td>';
                    $red_line .= '<td>'.$hit['hitBy'].'</td>';
                    $red_line .= '<td>'.$hit['missile'].'</td>';
                    $red_line .= '<td>'.$hit['missileBy'].'</td>';

                    $red_line .= '</tr>';

                    $red_table .= $red_line;
                }
            } else {
                $title_line = $hit['name'].' - <span class="text-'.(('red' == $hit['team']) ? 'danger' : 'success').' text-capitalize">'.$hit['team'].' '.$hit['position'].'</span>';
            }
        } ?>
<h4 class="my-2"><?php echo $title_line; ?>
</h4>
<div class="card">
    <div class="card-body p-0 mb-2">
        <h3 class="card-title bg-success m-0 text-light text-center">
            Green Team
        </h3>
        <div class="table-responsive">
            <table class="table table-striped table-bordered table-hover table-sm m-0 text-nowrap">
                <thead>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Shot</th>
                    <th>Shot By</th>
                    <th>Missiled</th>
                    <th>Missiled By</th>
                </thead>
                <tbody>
                    <?php echo $green_table; ?>
                </tbody>
            </table>
        </div>
    </div>
    <div class="card-body p-0">
        <h3 class="card-title bg-danger m-0 text-light text-center">
            Red Team
        </h3>
        <div class="table-responsive">
            <table class="table table-striped table-bordered table-hover table-sm m-0 text-nowrap">
                <thead>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Shot</th>
                    <th>Shot By</th>
                    <th>Missiled</th>
                    <th>Missiled By</th>
                </thead>
                <tbody>
                    <?php echo $red_table; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
<?php
    } else {
        echo 'No data available';
    }
