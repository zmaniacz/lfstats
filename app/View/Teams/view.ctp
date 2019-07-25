<?php
    $scorecards = array();

    $wins = 0;
    $losses = 0;
    $red_wins = 0;
    $red_losses = 0;
    $red_wins_elim = 0;
    $green_wins_elim = 0;
    $red_losses_elim = 0;
    $green_losses_elim = 0;


    $team_mvp = 0;
    $team_shots_fired = 0;
    $team_shots_hit = 0;
    $team_games = 0;
    $team_medic_hits = 0;

    //Gather alll the scorecards into a single array
    foreach ($team['Red_Game'] as $game) {
        foreach ($game['Red_Scorecard'] as $scorecard) {
            $scorecards[] = $scorecard;
        }

        if ($game['winner'] == 'red') {
            $wins++;
            $red_wins++;
            if ($game['green_eliminated'] > 0) {
                $red_wins_elim++;
            }
        } else {
            $losses++;
            $red_losses++;
            if ($game['red_eliminated'] > 0) {
                $red_losses_elim++;
            }
        }

        $team_games++;
    }

    foreach ($team['Green_Game'] as $game) {
        foreach ($game['Green_Scorecard'] as $scorecard) {
            $scorecards[] = $scorecard;
        }

        if ($game['winner'] == 'green') {
            $wins++;
            if ($game['red_eliminated'] > 0) {
                $green_wins_elim++;
            }
        } else {
            $losses++;
            if ($game['green_eliminated'] > 0) {
                $green_losses_elim++;
            }
        }

        $team_games++;
    }

    $winloss = array(
        'wins' => $wins,
        'losses' => $losses
    );

    $winlossdetail = array(
        'elim_wins_from_red' => $red_wins_elim,
        'non_elim_wins_from_red' => ($red_wins - $red_wins_elim),
        'elim_wins_from_green' => $green_wins_elim,
        'non_elim_wins_from_green' => ($wins - $red_wins - $green_wins_elim),
        'elim_losses_from_red' => $red_losses_elim,
        'non_elim_losses_from_red' => ($red_losses - $red_losses_elim),
        'elim_losses_from_green' => $green_losses_elim,
        'non_elim_losses_from_green' => ($losses - $red_losses - $green_losses_elim)
    );
    
    //populate plyer positions
    $player_positions = array();
    foreach ($scorecards as $scorecard) {
        if (!isset($player_positions[$scorecard['player_id']])) {
            $player_positions[$scorecard['player_id']] = array(
                'player_name' => $scorecard['player_name'],
                'games_played' => 0,
                'is_sub' => 0,
                'Commander' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
                'Heavy Weapons' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
                'Scout' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
                'Ammo Carrier' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0),
                'Medic' => array('games_played' => 0, 'total_mvp' => 0, 'total_score' => 0)
            );
        }

        $player_positions[$scorecard['player_id']][$scorecard['position']]['games_played'] += 1;
        $player_positions[$scorecard['player_id']]['games_played'] += 1;
        $player_positions[$scorecard['player_id']]['is_sub'] += $scorecard['is_sub'];
        $player_positions[$scorecard['player_id']][$scorecard['position']]['total_mvp'] += $scorecard['mvp_points'];
        $player_positions[$scorecard['player_id']][$scorecard['position']]['total_score'] += $scorecard['score'];

        $team_mvp += $scorecard['mvp_points'];
        $team_shots_fired += $scorecard['shots_fired'];
        $team_shots_fired += $scorecard['shots_hit'];
        $team_medic_hits += $scorecard['medic_hits'];
        ;
    }
?>
<h2 class="text-warning">
    <?= $details['Event']['name']; ?>
    -
    <?= $team['EventTeam']['name']; ?>
</h2>
<h4 class="my-4">
    Roster
</h4>
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="positions_table">
    <thead>
        <tr>
            <th rowspan="2">Merc</th>
            <th rowspan="2">Player</th>
            <th rowspan="2">Games Played</th>
            <th colspan="3">Commander</th>
            <th colspan="3">Heavy Weapons</th>
            <th colspan="3">Scout</th>
            <th colspan="3">Ammo Carrier</th>
            <th colspan="3">Medic</th>
        </tr>
        <tr>
            <th>Games</th>
            <th>Avg. MVP</th>
            <th>Avg. Score</th>
            <th>Games</th>
            <th>Avg. MVP</th>
            <th>Avg. Score</th>
            <th>Games</th>
            <th>Avg. MVP</th>
            <th>Avg. Score</th>
            <th>Games</th>
            <th>Avg. MVP</th>
            <th>Avg. Score</th>
            <th>Games</th>
            <th>Avg. MVP</th>
            <th>Avg. Score</th>
        </tr>
    </thead>
    <tbody class="text-center">
        <?php foreach ($player_positions as $player => $position): ?>
        <tr>
            <?php
                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $details['Event']['id'])) {
                    $merc = '<td><div class="custom-control custom-switch"><input type="checkbox" class="custom-control-input switch_sub_cbox" data-player-id="'.$player.'" data-team-id="'.$team['EventTeam']['id'].'" data-toggle="'.(($position['is_sub'] < $position['games_played']) ? 1 : 0).'" id="merc_switch_'.$player.'" '.(($position['is_sub'] == $position['games_played']) ? 'checked' : '').'><label class="custom-control-label" for="merc_switch_'.$player.'"></label></div></td>';
                } else {
                    $merc = (($position['is_sub'] > 0) ? '<td class="text-warning"><i class="material-icons">warning</i></td>' : '<td></td>');
                }
                echo $merc;
            ?>
            <td>
                <?= $this->Html->link($position['player_name'], array('controller' => 'players', 'action' => 'view', $player)); ?>
            </td>
            <td>
                <?= $position['games_played']; ?>
            </td>
            <td>
                <?= $position['Commander']['games_played']; ?>
            </td>
            <td>
                <?= round($position['Commander']['total_mvp']/max($position['Commander']['games_played'], 1), 2); ?>
            </td>
            <td>
                <?= round($position['Commander']['total_score']/max($position['Commander']['games_played'], 1), 0); ?>
            </td>
            <td>
                <?= $position['Heavy Weapons']['games_played']; ?>
            </td>
            <td>
                <?= round($position['Heavy Weapons']['total_mvp']/max($position['Heavy Weapons']['games_played'], 1), 2); ?>
            </td>
            <td>
                <?= round($position['Heavy Weapons']['total_score']/max($position['Heavy Weapons']['games_played'], 1), 0); ?>
            </td>
            <td>
                <?= $position['Scout']['games_played']; ?>
            </td>
            <td>
                <?= round($position['Scout']['total_mvp']/max($position['Scout']['games_played'], 1), 2); ?>
            </td>
            <td>
                <?= round($position['Scout']['total_score']/max($position['Scout']['games_played'], 1), 0); ?>
            </td>
            <td>
                <?= $position['Ammo Carrier']['games_played']; ?>
            </td>
            <td>
                <?= round($position['Ammo Carrier']['total_mvp']/max($position['Ammo Carrier']['games_played'], 1), 2); ?>
            </td>
            <td>
                <?= round($position['Ammo Carrier']['total_score']/max($position['Ammo Carrier']['games_played'], 1), 0); ?>
            </td>
            <td>
                <?= $position['Medic']['games_played']; ?>
            </td>
            <td>
                <?= round($position['Medic']['total_mvp']/max($position['Medic']['games_played'], 1), 2); ?>
            </td>
            <td>
                <?= round($position['Medic']['total_score']/max($position['Medic']['games_played'], 1), 0); ?>
            </td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>
<h4 class="my-4">
    Wins/Losses
</h4>
<div id="win_loss_pie" style="height: 400px; width: 400px">Loading...</div>
<div>
    <input class="float-right" type="text" id="search-criteria" placeholder="Search Matches..." />
    <?php foreach ($details['Round'] as $round): ?>
    <h3 class="my-4">
        <?= (($round['is_finals']) ? "Finals" : "Round ".$round['round']); ?>
    </h3>
    <div class="row">
        <?php
        foreach ($round['Match'] as $match) {
            echo $this->element('MatchCard', array(
                "match" => $match
            ));
        }
        ?>
    </div>
    <?php endforeach; ?>
</div>
<script>
$(document).ready(function() {
    $('#search-criteria').keyup(function() {
        $('.match-panel').hide();
        var txt = $('#search-criteria').val();
        $('.match-panel').each(function() {
            if ($(this).text().toUpperCase().indexOf(txt.toUpperCase()) != -1) {
                $(this).show();
            }
        });
    });

    $('.switch_sub_cbox').change(function() {
        $.ajax({
            url: "/scorecards/switchSubAll/" + $(this).data('playerId') + "/" + $(this)
                .data('teamId') + "/" + $(this).data('toggle') + ".json",
            success: function(data) {
                toastr.success('Set Merc Status')
            }
        });
    });

    function renderWinLossPie(data) {
        var winloss = [
            ['Wins', data['winloss']['wins']],
            ['Losses', data['winloss']['losses']]
        ];
        var winlossdetail = [
            ['Red Elim Wins', data['winlossdetail']['elim_wins_from_red']],
            ['Red Non-Elim Wins', data['winlossdetail']['non_elim_wins_from_red']],
            ['Green Elim Wins', data['winlossdetail']['elim_wins_from_green']],
            ['Green Non-Elim Wins', data['winlossdetail']['non_elim_wins_from_green']],
            ['Red Elim Losses', data['winlossdetail']['elim_losses_from_red']],
            ['Red Non-Elim Losses', data['winlossdetail']['non_elim_losses_from_red']],
            ['Green Elim Losses', data['winlossdetail']['elim_losses_from_green']],
            ['Green Non-Elim Losses', data['winlossdetail']['non_elim_losses_from_green']]
        ];

        $('#win_loss_pie').highcharts({
            chart: {
                type: 'pie',
                height: 400
            },
            title: {
                text: null
            },
            tooltip: {
                headerFormat: '',
                pointFormat: '{point.name}: <b>{point.y}</b>'
            },
            yAxis: {
                title: {
                    text: 'Wins'
                }
            },
            plotOptions: {
                pie: {
                    shadow: false,
                    center: ['50%', '50%']
                }
            },
            series: [{
                data: winloss,
                colors: [
                    '#5bc0de',
                    '#008cba'
                ],
                size: '40%',
                dataLabels: {
                    formatter: function() {
                        return this.point.name;
                    },
                    color: 'black',
                    distance: -30
                }
            }, {
                data: winlossdetail,
                colors: [
                    '#F04124',
                    '#D7280B',
                    '#43ac6a',
                    '#2A9351'
                ],
                size: '80%',
                innerSize: '60%',
                dataLabels: {
                    enabled: false
                }
            }]
        });
    }

    renderWinLossPie
        (<?= json_encode(compact('winloss', 'winlossdetail')); ?>);
});
</script>