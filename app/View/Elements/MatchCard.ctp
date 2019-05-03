<?php
    $team1Game1Score = $team2Game1Score = $team1Game2Score = $team2Game2Score = 0;
    if (!empty($match['Game_1'])) {
        $game1Url = $this->Html->url(array('controller' => 'Games', 'action' => 'view', $match['Game_1']['id']));
        $team1Game1Score = $match['Game_1']['red_score']+$match['Game_1']['red_adj'];
        $team2Game1Score = $match['Game_1']['green_score']+$match['Game_1']['green_adj'];
    }

    if (!empty($match['Game_2'])) {
        $game2Url = $this->Html->url(array('controller' => 'Games', 'action' => 'view', $match['Game_2']['id']));
        $team1Game2Score = $match['Game_2']['green_score']+$match['Game_2']['green_adj'];
        $team2Game2Score = $match['Game_2']['red_score']+$match['Game_2']['red_adj'];
    }
?>
<div class="card col-md-6">
    <div class="card-body">
        <table class="table table-sm nowrap">
            <caption style="caption-side: top;">Match
                <?= $match['match']; ?>
            </caption>
            <thead>
                <tr>
                    <th>Team</th>
                    <th class="text-center">Match Points</th>
                    <th class="text-center">Game 1</th>
                    <th class="text-center">Game 2</th>
                    <th class="text-center">Score Diff</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <?php
                    if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                        echo "<select id=\"Match{$match['match']}Team1\" 
                                class=\"match-select form-control\" 
                                data-match-id={$match['id']}
                                data-match-number={$match['match']}
                                data-round-id={$match['round_id']}
                                data-team=1
                                >";
                        echo "<option value=\"\">Select a team</option>";
                        foreach ($teams as $key => $value) {
                            if ($key == $match['team_1_id']) {
                                echo "<option value=\"$key\" selected>$value</option>";
                            } else {
                                echo "<option value=\"$key\">$value</option>";
                            }
                        }
                        echo "</select>";
                    } else {
                        echo (is_null($match['team_1_id'])) ? "TBD" : $this->Html->link($teams[$match['team_1_id']], array('controller' => 'teams', 'action' => 'view', $match['team_1_id']));
                        if (!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_1_points'] > $match['team_2_points']) {
                            echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
                        }
                    }
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    echo " <strong>{$match['team_1_points']}</strong>";
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    if (!empty($match['Game_1'])) {
                        echo "<a href=\"$game1Url\">$team1Game1Score</a>";
                        if (($match['Game_1']['winner'] == 'red' && $match['team_1_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_1_id'] == $match['Game_1']['green_team_id'])) {
                            echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                        } else {
                            echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                        }
                    }
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    if (!empty($match['Game_2'])) {
                        echo "<a href=\"$game2Url\">$team1Game2Score</a>";
                        if (($match['Game_2']['winner'] == 'red' && $match['team_1_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_1_id'] == $match['Game_2']['green_team_id'])) {
                            echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                        } else {
                            echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                        }
                    }
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    $team1Diff = ($team1Game1Score+$team1Game2Score) - ($team2Game1Score+$team2Game2Score);
                    if ($team1Diff > 0) {
                        echo "<span class=\"text-success\">{$team1Diff}</span>";
                    } else {
                        echo "<span class=\"text-danger\">{$team1Diff}</span>";
                    }
                ?>
                    </td>
                </tr>
                <tr>
                    <td>
                        <?php
                    if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                        echo "<select id=\"Match{$match['match']}Team2\" 
                                class=\"match-select form-control\" 
                                data-match-id={$match['id']}
                                data-match-number={$match['match']}
                                data-round-id={$match['round_id']}
                                data-team=2
                                >";
                        echo "<option value=\"\">Select a team</option>";
                        foreach ($teams as $key => $value) {
                            if ($key == $match['team_2_id']) {
                                echo "<option value=\"$key\" selected>$value</option>";
                            } else {
                                echo "<option value=\"$key\">$value</option>";
                            }
                        }
                        echo "</select>";
                    } else {
                        echo (is_null($match['team_2_id'])) ? "TBD" : $this->Html->link($teams[$match['team_2_id']], array('controller' => 'teams', 'action' => 'view', $match['team_2_id']));
                        if (!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_2_points'] > $match['team_1_points']) {
                            echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
                        }
                    }
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    echo " <strong>{$match['team_2_points']}</strong>";
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    if (!empty($match['Game_1'])) {
                        echo "<a href=\"$game1Url\">$team2Game1Score</a>";
                        if (($match['Game_1']['winner'] == 'red' && $match['team_2_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_2_id'] == $match['Game_1']['green_team_id'])) {
                            echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                        } else {
                            echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                        }
                    }
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    if (!empty($match['Game_2'])) {
                        echo "<a href=\"$game2Url\">$team2Game2Score</a>";
                        if (($match['Game_2']['winner'] == 'red' && $match['team_2_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_2_id'] == $match['Game_2']['green_team_id'])) {
                            echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                        } else {
                            echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                        }
                    }
                ?>
                    </td>
                    <td class="text-center">
                        <?php
                    $team2Diff = ($team2Game1Score+$team2Game2Score) - ($team1Game1Score+$team1Game2Score);
                    if ($team2Diff > 0) {
                        echo "<span class=\"text-success\">{$team2Diff}</span>";
                    } else {
                        echo "<span class=\"text-danger\">{$team2Diff}</span>";
                    }
                ?>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>