<?php if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))): ?>
<h3 class="text-danger">IMPORTANT</h3>
<p class="lead">
    Matches MUST be configured on the standings page before they can be applied here.
    In the dropdown, teams are listed in order of RED v GREEN. Be sure to choose the
    appropriate game number based on that.
</p>
<?php endif; ?>
<?php
    $game_name = $game_name = $game['Game']['game_name'];
    if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
        echo $this->Form->create('Game', array(
            'class' => 'form-horizontal',
            'role' => 'form',
            'inputDefaults' => array(
                'format' => array('before', 'label', 'between', 'input', 'error', 'after'),
                'div' => array('class' => 'form-group'),
                'class' => array('form-control'),
                'label' => array('class' => 'col-lg-2 control-label'),
                'between' => '<div class="col-lg-3">',
                'after' => '</div>',
                'error' => array('attributes' => array('wrap' => 'span', 'class' => 'help-inline')),
        )));
        echo $this->Form->input('id');
        if (isset($selected_league) && $selected_league['Event']['is_comp']) {
            $match_list = array();
            foreach ($available_matches['Round'] as $round) {
                foreach ($round['Match'] as $match) {
                    if (empty($match['Game_1']) || $match['Game_1']['id'] == $game['Game']['id']) {
                        $match_list[$match['id']."|1"] = "R{$round['round']} M{$match['match']} G1 - {$match['Team_1']['name']} v {$match['Team_2']['name']}";
                    }
                    
                    if (empty($match['Game_2']) || $match['Game_2']['id'] == $game['Game']['id']) {
                        $match_list[$match['id']."|2"] = "R{$round['round']} M{$match['match']} G2 - {$match['Team_2']['name']} v {$match['Team_1']['name']}";
                    }
                }
            }
            echo $this->Form->input('league_id', array('type' => 'hidden'));
            echo $this->Form->input('match', array(
                'type' => 'select',
                'options' => array($match_list),
                'empty' => array("0|0" => 'Unassigned'),
                'selected' => $game['Game']['match_id']."|".$game['Game']['league_game'],
            ));
        } else {
            echo $this->Form->input('game_name');
        }
        
        echo $this->Form->end(array('value' => 'Update', 'class' => 'btn btn-warning'));
        echo $this->Html->link("Delete Game", array('controller' => 'Games', 'action' => 'delete', $game['Game']['id']), array('class' => 'btn btn-danger'), __('ARE YOU VERY SURE YOU WANT TO DELETE # %s?  THIS WILL DELETE ALL ASSOCIATED SCORECARDS!!!', $game['Game']['id']));
    }

    if (isset($game['Game']['event_id']) && !is_null($game['Match']['id'])) {
        $game_name = 'R'.$game['Match']['Round']['round'].' M'.$game['Match']['match'].' G'.$game['Game']['league_game'];
    }
    
    if ($game['Game']['red_team_id'] != null) {
        $red_team_name = $this->Html->link($teams[$game['Game']['red_team_id']], array('controller' => 'teams', 'action' => 'view', $game['Game']['red_team_id']), array('class' => 'text-danger'));
    } else {
        $red_team_name = '<span class="text-danger">Red Team</span>';
    }

    if ($game['Game']['green_team_id'] != null) {
        $green_team_name = $this->Html->link($teams[$game['Game']['green_team_id']], array('controller' => 'teams', 'action' => 'view', $game['Game']['green_team_id']), array('class' => 'text-success'));
    } else {
        $green_team_name = '<span class="text-success">Green Team</span>';
    }
?>
<h3 class="text-center"><?= $game_name; ?>
</h3>
<h4 class="text-center"><small><?= $game['Game']['game_datetime']; ?></small>
</h4>
<div class="d-flex justify-content-between">
    <?php
        if (!empty($neighbors['prev'])) {
            echo $this->Html->link('<i class="material-icons">skip_previous</i> Previous Game', array('controller' => 'games', 'action' => 'view', $neighbors['prev']['Game']['game_id']), array('escape' => false));
        }
        ?>
    <h3 class="text-center text-nowrap">
        <?= $red_team_name; ?> vs <?= $green_team_name; ?>
    </h3>
    <?php
        if (!empty($neighbors['next'])) {
            echo $this->Html->link('Next Game <i class="material-icons">skip_next</i> ', array('controller' => 'games', 'action' => 'view', $neighbors['next']['Game']['game_id']), array('escape' => false));
        }
        ?>
</div>
<h6 class="d-flex justify-content-between my-4">
    <span>Numbers in parentheses are score adjustments due to penalties and elimination bonuses.</span>
    <?= $this->Html->link("PDF", "http://lfstatsscorecards.objects-us-east-1.dream.io/".$game['Game']['pdf_id'].".pdf", array('target' => '_blank')); ?>
</h6>
<?php
        if ($game['Game']['winner'] == 'green') {
            $winner = (($game['Game']['green_team_id'] != null) ? $teams[$game['Game']['green_team_id']] : "Green Team");
            $winner_panel = "bg-success";
            $winner_score = ($game['Game']['green_score']+$game['Game']['green_adj']);
            $winner_adj = "";
            if ($game['Game']['green_adj'] != 0) {
                $winner_adj = " (".$game['Game']['green_adj'].")";
            }
                
            $loser = (($game['Game']['red_team_id'] != null) ? $teams[$game['Game']['red_team_id']] : "Red Team");
            $loser_panel = "bg-danger";
            $loser_score = ($game['Game']['red_score']+$game['Game']['red_adj']);
            $loser_adj = "";
            if ($game['Game']['red_adj'] != 0) {
                $loser_adj = " (".$game['Game']['red_adj'].")";
            }
        } else {
            $winner = (($game['Game']['red_team_id'] != null) ? $teams[$game['Game']['red_team_id']] : "Red Team");
            $winner_panel = "bg-danger";
            $winner_score = ($game['Game']['red_score']+$game['Game']['red_adj']);
            $winner_adj = "";
            if ($game['Game']['red_adj'] != 0) {
                $winner_adj = " (".$game['Game']['red_adj'].")";
            }
            
            $loser = (($game['Game']['green_team_id'] != null) ? $teams[$game['Game']['green_team_id']] : "Green Team");
            $loser_panel = "bg-success";
            $loser_score = ($game['Game']['green_score']+$game['Game']['green_adj']);
            $loser_adj = "";
            if ($game['Game']['green_adj'] != 0) {
                $loser_adj = " (".$game['Game']['green_adj'].")";
            }
        }
            
            $winner_table = "";
            $loser_table = "";

            foreach ($game['Scorecard'] as $score) {
                $score_line = "";
                $penalty_score = 0;
                $penalty_string = "None";
                
                if (isset($score['Penalty']) && count($score['Penalty']) > 0) {
                    foreach ($score['Penalty'] as $penalty) {
                        $penalty_score += $penalty['value'];
                    }
                    $penalty_string = '<a href="#" data-toggle="modal" data-target="#genericModal" data-title="Penalty Details" data-modalsize="modal-lg" target="'.$this->Html->url(array('controller' => 'Penalties', 'action' => 'getPenaltyBreakdown', $score['id'], 'ext' => 'json')).'">'.count($score['Penalty']).' <i class="material-icons">bar_chart</i></a>';
                }

                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
                    $merc = '<td><form><input type="checkbox" class="switch_sub_cbox" id='.$score['id'].' '.(($score['is_sub']) ? 'checked' : '').'></form></td>';
                } else {
                    $merc = (($score['is_sub']) ? '<td class="text-warning"><i class="material-icons">warning</i></td>' : '<td></td>');
                }

                if ($score['survived'] > 0) {
                    //We have a survival time so let's draw a pie chart
                    $alive = (($score['lives_left'] > 0) ? '<td class="text-success">' : '<td class="text-danger text-center">').'<svg class="timeLeft" data-percent="'.round($score['survived']/$game['Game']['game_length'], 2).'" viewBox="-1 -1 2 2" style="transform: rotate(-90deg);height:25px"><title>'.gmdate("i:s", $score['survived']).'</title></svg></td>';
                } else {
                    $alive = (($score['lives_left'] > 0) ? '<td class="text-success"><i class="material-icons">check</i></span>' : '<td class="text-danger text-center"><i class="material-icons">close</i></span>').'</td>';
                }
                
                $score_line .= "<tr class=\"text-center\">";
                $score_line .= "<td>".$this->Html->link($score['player_name'], array('controller' => 'Players', 'action' => 'view', $score['player_id']))."</td>";
                $score_line .= $alive;
                $score_line .= $merc;
                $score_line .= "<td>".$score['position']."</td>";
                $score_line .= "<td>".($score['score']+$penalty_score).(($penalty_score != 0) ? " ($penalty_score)" : "")."</td>";
                $score_line .= '<td><a href="#" data-toggle="modal" data-target="#genericModal" data-title="MVP Details" data-modalsize="modal-sm" target="/scorecards/getMVPBreakdown/'.$score['id'].'.json">'.$score['mvp_points'].' <i class="material-icons">bar_chart</i></a></td>';
                $score_line .= "<td>".$score['lives_left']."</td>";
                $score_line .= "<td>".$score['shots_left']."</td>";
                $score_line .= '<td><a href="#" data-toggle="modal" data-target="#genericModal" data-title="Hit Details" data-modalsize="modal-lg" target="/scorecards/getHitBreakdown/'.$score['player_id'].'/'.$score['game_id'].'.json">'.round($score['shot_opponent']/max($score['times_zapped'], 1), 2)." (".$score['shot_opponent']."/".$score['times_zapped'].') <i class="material-icons">bar_chart</i></a></td>';
                $score_line .= "<td>".$score['missiled_opponent']."</td>";
                $score_line .= "<td>".$score['times_missiled']."</td>";
                $score_line .= "<td>".$score['medic_hits'].($score['position'] == 'Commander' ? "/".$score['medic_nukes'] : "")."</td>";
                $score_line .= "<td>".$score['shot_team']."</td>";
                $score_line .= "<td>".$score['missiled_team']."</td>";
                $score_line .= "<td>".round($score['accuracy']*100, 2)."%</td>";
                $score_line .= "<td>".($score['position'] == 'Medic' || $score['position'] == 'Ammo Carrier' || $score['position'] == 'Commander' ? $score['sp_spent']."/".$score['sp_earned'] : "-")."</td>";
                $score_line .= "<td>".($score['position'] == 'Commander' ? $score['nukes_detonated']."/".$score['nukes_activated'] : "-")."</td>";
                $score_line .= "<td>".($score['nukes_canceled'] > 0 ? $score['nukes_canceled'] : "-")."</td>";
                $score_line .= "<td>".($score['position'] == 'Medic' ? $score['life_boost'] : ($score['position'] == 'Ammo Carrier' ? $score['ammo_boost'] : "-"))."</td>";
                $score_line .= "<td>".($score['position'] == 'Medic' || $score['position'] == 'Ammo Carrier' ? $score['resupplies'] : "-")."</td>";
                $score_line .= "<td>$penalty_string";
                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
                    $score_line.= '<br/>'.$this->Html->link("Add", array('controller' => 'Penalties', 'action' => 'add', $score['id']), array('class' => 'btn btn-warning'));
                }
                $score_line .= "</td></tr>";
                
                if ($score['team'] == $game['Game']['winner']) {
                    $winner_table .= $score_line;
                } else {
                    $loser_table .= $score_line;
                }
            }
        ?>
<div id="winner_card" class="card">
    <h3 class="card-header text-light <?=$winner_panel;?>">
        <?= $winner; ?>
    </h3>
    <div class="card-body p-0">
        <div class="d-flex justify-content-between">
            <h3 class="text-primary m-2">
                <?= "Score: ".$winner_score.$winner_adj; ?>
            </h3>
            <div class="align-self-center">
                <?php
                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
                    echo $this->Html->link("Add Team Penalty", array('controller' => 'TeamPenalties', 'action' => 'add', $game['Game']['id'], $game['Game']['winner']), array('class' => 'btn btn-warning'));
                }
            ?>
            </div>
            <div class="list-group list-group-flush m-2">
                <?php
                    if ($game['Game']['winner'] == 'green') {
                        if (isset($game['Green_TeamPenalties'])) {
                            foreach ($game['Green_TeamPenalties'] as $team_penalty) {
                                echo '<a href="#" class="text-warning" data-toggle="modal" data-title="Team Penalty Details" data-target="#genericModal" target="'.$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json')).'">'.$team_penalty['type'].' ('.$team_penalty["value"].')</a>';
                            }
                        }
                    } elseif ($game['Game']['winner'] == 'red') {
                        if (isset($game['Red_TeamPenalties'])) {
                            foreach ($game['Red_TeamPenalties'] as $team_penalty) {
                                echo '<a href="#" class="text-warning" data-toggle="modal" data-title="Team Penalty Details" data-target="#genericModal" target="'.$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json')).'">'.$team_penalty['type'].' ('.$team_penalty["value"].')</a>';
                            }
                        }
                    }
                ?>
            </div>
        </div>
        <div class="table-responsive">
            <table class="gamelist table table-striped table-bordered table-hover table-sm text-nowrap">
                <thead>
                    <th>Name</th>
                    <th>Alive</th>
                    <th>Merc</th>
                    <th>Position</th>
                    <th>Score</th>
                    <th>MVP</th>
                    <th>Lives Left</th>
                    <th>Shots Left</th>
                    <th>Hit Diff</th>
                    <th>Missiled</th>
                    <th>Got Missiled</th>
                    <th>Medic Hits</th>
                    <th>Shot Team</th>
                    <th>Missiled Team</th>
                    <th>Accuracy</th>
                    <th>SP Spent/Earned</th>
                    <th>Nukes</th>
                    <th>Nuke Cancels</th>
                    <th>Boosts</th>
                    <th>Resupplies</th>
                    <th>Penalties</th>
                </thead>
                <tbody>
                    <?= $winner_table; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
<div id="loser_card" class="card mt-3">
    <h3 class="card-header text-light <?=$loser_panel;?>">
        <?= $loser; ?>
    </h3>
    <div class="card-body p-0">
        <div class="d-flex justify-content-between">
            <h3 class="text-primary align-self-center mx-2">
                <?= "Score: ".$loser_score.$loser_adj; ?>
            </h3>
            <div class="align-self-center">
                <?php
                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $game['Game']['center_id'])) {
                    echo $this->Html->link("Add Team Penalty", array('controller' => 'TeamPenalties', 'action' => 'add', $game['Game']['id'], (($game['Game']['winner'] == 'red') ? 'green' : 'red')), array('class' => 'btn btn-warning'));
                }
            ?>
            </div>
            <div class="list-group list-group-flush align-self-center mx-2">
                <?php
                    if ($game['Game']['winner'] == 'green') {
                        if (isset($game['Red_TeamPenalties'])) {
                            foreach ($game['Red_TeamPenalties'] as $team_penalty) {
                                echo '<a href="#" class="list-group-item list-group-item-action text-warning" data-toggle="modal" data-title="Team Penalty Details" data-target="#genericModal" target="'.$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json')).'">'.$team_penalty['type'].' ('.$team_penalty["value"].')</a>';
                            }
                        }
                    } elseif ($game['Game']['winner'] == 'red') {
                        if (isset($game['Green_TeamPenalties'])) {
                            foreach ($game['Green_TeamPenalties'] as $team_penalty) {
                                echo '<a href="#" class="list-group-item list-group-item-action text-warning" data-toggle="modal" data-title="Team Penalty Details" data-target="#genericModal" target="'.$this->Html->url(array('controller' => 'TeamPenalties', 'action' => 'getTeamPenalty', $team_penalty['id'], 'ext' => 'json')).'">'.$team_penalty['type'].' ('.$team_penalty["value"].')</a>';
                            }
                        }
                    }
                ?>
            </div>
        </div>
    </div>
    <div class="table-responsive">
        <table class="gamelist table table-striped table-bordered table-hover table-sm text-nowrap">
            <thead>
                <th>Name</th>
                <th>Alive</th>
                <th>Merc</th>
                <th>Position</th>
                <th>Score</th>
                <th>MVP Points</th>
                <th>Lives Left</th>
                <th>Shots Left</th>
                <th>Hit Diff</th>
                <th>Missiled</th>
                <th>Got Missiled</th>
                <th>Medic Hits</th>
                <th>Shot Team</th>
                <th>Missiled Team</th>
                <th>Accuracy</th>
                <th>SP Spent/Earned</th>
                <th>Nukes</th>
                <th>Nuke Cancels</th>
                <th>Boosts</th>
                <th>Resupplies</th>
                <th>Penalties</th>
            </thead>
            <tbody>
                <?= $loser_table; ?>
            </tbody>
        </table>
    </div>
    <script type="text/javascript">
    function getCoordinatesForPercent(percent) {
        const x = Math.cos(2 * Math.PI * percent);
        const y = Math.sin(2 * Math.PI * percent);
        return [x, y];
    }

    $(document).ready(function() {
        $('.gamelist').DataTable({
            searching: false,
            info: false,
            paging: false,
            ordering: false,
            scrollX: true,
            fixedColumns: true
        });

        $('.timeLeft').each(function() {
            const [endX, endY] = getCoordinatesForPercent($(this).data("percent"));

            // if the slice is more than 50%, take the large arc (the long way around)
            const largeArcFlag = $(this).data("percent") > .5 ? 1 : 0;

            // create an array and join it just for code readability
            const pathData = [
                `M 1 0`, // Move
                `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`, // Arc
                `L 0 0`, // Line
            ].join(' ');

            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', pathData);
            pathEl.setAttribute('fill', 'currentColor');
            $(this).append(pathEl);
        })

        $('.switch_sub_cbox').change(function() {
            $.ajax({
                url: "/scorecards/ajax_switchSub/" + $(this).prop('id') + ".json",
                success: function(data) {
                    toastr.success('Set Merc Status')
                }
            });
        });
    });
    </script>