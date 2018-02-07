<?php
    if(!empty($hits)) {
        $green_table = "";
        $red_table = "";
        foreach($hits as $hit) {
            if($hit['id'] != $player_id) {
                if($hit['team'] == 'green') {
                    $green_line = "<tr>";
                    
                    $green_line .= "<td>".$hit['name']."</td>";
                    $green_line .= "<td>".$hit['position']."</td>";
                    $green_line .= "<td>".$hit['hit']."</td>";
                    $green_line .= "<td>".$hit['hitBy']."</td>";
                    $green_line .= "<td>".$hit['missile']."</td>";
                    $green_line .= "<td>".$hit['missileBy']."</td>";
            
                    $green_line .= "</tr>";
                    
                    $green_table .= $green_line;
                } else {
                    $red_line = "<tr>";
                    
                    $red_line .= "<td>".$hit['name']."</td>";
                    $red_line .= "<td>".$hit['position']."</td>";
                    $red_line .= "<td>".$hit['hit']."</td>";
                    $red_line .= "<td>".$hit['hitBy']."</td>";
                    $red_line .= "<td>".$hit['missile']."</td>";
                    $red_line .= "<td>".$hit['missileBy']."</td>";
            
                    $red_line .= "</tr>";
                    
                    $red_table .= $red_line;
                }
            } else {
                $title_line = "<h3>".$hit['name']." - <span class=\"text-".(($hit['team'] == 'red') ? "danger" : "success")." text-capitalize\">".$hit['team']." ".$hit['position']."</span></h3>";
            }
        }
?>
    <div class="well well-sm"><?=$title_line; ?></div>
    <div id="green_panel" class="panel panel-success">
        <div class="panel-heading" data-toggle="collapse" data-parent="#green_panel" data-target="#collapse_green_panel" role="tab" id="green_panel_heading">
            <h3 class="panel-title">
                Green Team
            </h3>
        </div>
        <div id="collapse_green_panel" class="panel-collapse collapse in" role="tabpanel">
            <div class="table-responsive">
                <table class="table table-striped table-bordered table-hover table-condensed">
                    <thead>
                        <th>Name</th>
                        <th>Position</th>
                        <th>Shot</th>
                        <th>Shot By</th>
                        <th>Missiled</th>
                        <th>Missiled By</th>
                    </thead>
                    <tbody>
                        <?= $green_table; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <div id="red_panel" class="panel panel-danger">
        <div class="panel-heading" data-toggle="collapse" data-parent="#red_panel" data-target="#collapse_red_panel" role="tab" id="red_panel_heading">
            <h3 class="panel-title">
                Red Team
            </h3>
        </div>
        <div id="collapse_red_panel" class="panel-collapse collapse in" role="tabpanel">
            <div class="table-responsive">
                <table class="table table-striped table-bordered table-hover table-condensed">
                    <thead>
                        <th>Name</th>
                        <th>Position</th>
                        <th>Shot</th>
                        <th>Shot By</th>
                        <th>Missiled</th>
                        <th>Missiled By</th>
                    </thead>
                    <tbody>
                        <?= $red_table; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
<?php
    } else {
        echo "No data available";
    }
?>