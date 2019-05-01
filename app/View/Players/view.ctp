<?= $this->element('breadcrumbs'); ?>
<hr>
<?php
    $types = array("overall","commander","heavy","scout","ammo","medic");

foreach ($types as $type) {
    ${$type."_acc_plot"} = array();
    ${$type."_score_plot"} = array();
    ${$type."_mvp_plot"} = array();
    ${$type."_medic_plot"} = array();
    ${$type."_hitdiff_plot"} = array();

    foreach (${$type}[0]['Scorecard'] as $key => $val) {
        ${$type."_acc_plot"}[] = ((float)$val['shots_hit']/max((float)$val['shots_fired'], 1))*100;
        ${$type."_score_plot"}[] = (float)$val['score'];
        ${$type."_mvp_plot"}[] = (float)$val['mvp_points'];
        ${$type."_medic_plot"}[] = (float)$val['medic_hits'];
        ${$type."_hitdiff_plot"}[] = ((float)$val['shot_opponent']/max((float)$val['times_zapped'], 1));
    }
    ${$type."_acc_json"} = json_encode(${$type."_acc_plot"});
    ${$type."_score_json"} = json_encode(${$type."_score_plot"});
    ${$type."_mvp_json"} = json_encode(${$type."_mvp_plot"});
    ${$type."_medic_json"} = json_encode(${$type."_medic_plot"});
    ${$type."_hitdiff_json"} = json_encode(${$type."_hitdiff_plot"});
}


?>
<h1 class="text-primary">
    <?= $overall[0]['Player']['player_name']; ?>
</h1>
<?php if (sizeof($aliases) > 1): ?>
<p>
    Aliases:
    <ul>
        <?php foreach ($aliases as $alias): ?>
        <?php if ($alias['PlayersName']['player_name'] != $overall[0]['Player']['player_name']): ?>
        <li>
            <?php echo $alias['PlayersName']['player_name']; ?>
        </li>
        <?php endif; ?>
        <?php endforeach; ?>
    </ul>
</p>
<?php endif; ?>
<div>
    <?php if (AuthComponent::user('role') === 'admin'): ?>
    <a href="<?= $this->Html->url(array('controller' => 'players', 'action' => 'link', $overall[0]['Player']['id'])); ?>"
        class="btn btn-success" role="button">Link</a>
    <?php endif; ?>
</div>
<ul class="nav nav-tabs" id="playerTab">
    <li class="nav-item"><a class="nav-link active" id="game-list-tab" href="#game-list" data-toggle="tab">Game List</a>
    </li>
    <li class="nav-item"><a class="nav-link" id="overall-tab" href="#overall" data-toggle="tab">Overall</a></li>
    <li class="nav-item"><a class="nav-link" id="head-to-head-tab" href="#head-to-head" data-toggle="tab">Head To
            Head</a></li>
</ul>
<div class="tab-content" id="playerTabContent">
    <div class="tab-pane fade show active" id="game-list">
        <h4 class="my-4">
            Recent Wins and Losses
        </h4>
        <div id="win_loss_bar">Loading...</div>
        <h4 class="my-4">
            Overall Wins and Losses
        </h4>
        <div id="win_loss_pie">Loading...</div>
        <h4 class="my-4">
            Games Played
        </h4>
        <div class="table-responsive">
            <table id="game_list" class="table table-striped table-hover table-border table-sm nowrap">
                <thead>
                    <tr>
                        <th>Game</th>
                        <th>Time</th>
                        <th>W/L</th>
                        <th>Team</th>
                        <th>Position</th>
                        <th rowspan="2">Score</th>
                        <th rowspan="2">Max Score</th>
                        <th rowspan="2">Score Ratio</th>
                        <th rowspan="2">Accuracy</th>
                        <th rowspan="2">MVP Points</th>
                        <th rowspan="2">Lives Left</th>
                        <th rowspan="2">Shots Left</th>
                        <th rowspan="2">Shot Opponent</th>
                        <th rowspan="2">Got Shot</th>
                        <th rowspan="2">Hit Diff</th>
                        <th rowspan="2">Missiled</th>
                        <th rowspan="2">Got Missiled</th>
                        <th rowspan="2">Medic Hits</th>
                        <th rowspan="2">Medic Nukes</th>
                        <th rowspan="2">Shot 3-Hits</th>
                        <th rowspan="2">Shot Team</th>
                        <th rowspan="2">Missiled Team</th>
                        <th rowspan="2">Shot Own Medic</th>
                        <th rowspan="2">Nukes Activated</th>
                        <th rowspan="2">Nukes Detonated</th>
                        <th rowspan="2">Nuke Cancels</th>
                        <th rowspan="2">Own Nuke Cancels</th>
                        <th rowspan="2">Rapid Fires</th>
                        <th rowspan="2">Boosts</th>
                        <th rowspan="2">Resupplies</th>
                        <th rowspan="2">PDF</th>
                    </tr>
                    <tr>
                        <th class="searchable">Game</th>
                        <th class="searchable">Time</th>
                        <th class="searchable">W/L</th>
                        <th class="searchable">Team</th>
                        <th class="searchable">Position</th>
                    </tr>
                </thead>
            </table>
        </div>
        <h4 class="my-4">
            Bases Destroyed Average
        </h4>
        <div class="table-responsive">
            <table id="target_stats" class="table table-striped table-hover table-border table-sm nowrap">
                <thead>
                    <tr>
                        <th>Position</th>
                        <th>Overall</th>
                        <th>Player Survives</th>
                        <th>Survive and Elim Opp</th>
                        <th>Die and Elim Opp</th>
                        <th>Elimed</th>
                    </tr>
                </thead>
            </table>
        </div>
    </div>
    <div class="tab-pane fade" id="overall">
        <div class="row">
            <div class="col-sm-4 offset-sm-4 text-center">
                <div id="spiderSelector" class="btn-group btn-group-toggle" data-toggle="buttons">
                    <label class="btn btn-outline-info active">
                        <input type="radio" name="options" id="option_mvp" autocomplete="off" checked>MVP
                    </label>
                    <label class="btn btn-outline-info">
                        <input type="radio" name="options" id="option_score" autocomplete="off">Score
                    </label>
                </div>
            </div>
        </div>
        <div id="position_spider"></div>
        <hr>
        <div id="position_box_plot"></div>
        <div class="row mt-4">
            <p>The following graphs represent a simple rolling average for accuracy, score and MVP points both overall
                and
                by
                position.<br />
                Individual lines can be turned on and off by clicking on the title in the legend.<br />
                Clicking the legend items marked scatter will show all the points on the graph for the data set, if you
                like that
                sort of thing.<br />
                These graphs are not affected by the filters above.</p>
        </div>
        <div id="acc_plot" class="my-4" style="display: inline-block;height:400px;width:800px; "></div>
        <div id="mvp_plot" class="my-4" style="display: inline-block;height:400px;width:800px; "></div>
        <div id="score_plot" class="my-4" style="display: inline-block;height:400px;width:800px; "></div>
        <div id="hitdiff_plot" class="my-4" style="display: inline-block;height:400px;width:800px; "></div>
        <div id="medic_plot" class="my-4" style="display: inline-block;height:400px;width:800px; "></div>
    </div>
    <div class="tab-pane fade" id="head-to-head">
        <div class="row mt-4">
            <div class="col-sm-6">
                <h4>Choose Hits</h4>
                <div id="headTeamSelector" class="btn-group btn-group-toggle" data-toggle="buttons">
                    <label class="btn btn-outline-info active">
                        <input type="radio" name="head_team_options" value="opponent" autocomplete="off"
                            checked>Opponent
                    </label>
                    <label class="btn btn-outline-info">
                        <input type="radio" name="head_team_options" value="all" autocomplete="off">All
                    </label>
                    <label class="btn btn-outline-info">
                        <input type="radio" name="head_team_options" value="team" autocomplete="off">Team
                    </label>
                </div>
            </div>
        </div>
        <div class="row mt-4">
            <div class="col-sm-4">
                <h4>Player Positions</h4>
                <div id="headPlayerPosSelector" class="btn-group btn-group-toggle" data-toggle="buttons">
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_player_pos_options" value="commander" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-commander"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_player_pos_options" value="heavy" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-heavy"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_player_pos_options" value="scout" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-scout"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_player_pos_options" value="ammo" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-ammo"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_player_pos_options" value="medic" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-medic"></span>
                    </label>
                </div>
            </div>
            <div class="col-sm-4">
                <h4>Target Positions</h4>
                <div id="headTargetPosSelector" class="btn-group btn-group-toggle" data-toggle="buttons">
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_target_pos_options" value="commander" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-commander"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_target_pos_options" value="heavy" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-heavy"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_target_pos_options" value="scout" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-scout"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_target_pos_options" value="ammo" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-ammo"></span>
                    </label>
                    <label class="btn btn-outline-info active">
                        <input type="checkbox" name="head_target_pos_options" value="medic" autocomplete="off"
                            checked><span style="font-size:32px" class="icon-medic"></span>
                    </label>
                </div>
            </div>
        </div>
        <br />
        <div class="row">
            <div class="col-sm-4">
                <button id="applyChanges" class="btn btn-info">Apply</button>
            </div>
        </div>
        <br />
        <table id="head_to_head" class="table table-striped table-hover table-border table-sm">
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Shot</th>
                    <th>Shot By</th>
                    <th>Shot Ratio</th>
                    <th>Missiles</th>
                    <th>Missiled By</th>
                    <th>Missile Ratio</th>
                    <th>Games Played</th>
                </tr>
            </thead>
        </table>
    </div>
</div>
<script type="text/javascript">
$(document).ready(function() {
    const params = new URLSearchParams(location.search);

    function renderWinLossBar(data) {
        chartData = data.map(function(item, index) {
            let value = (item.winloss === "W") ? 1 : -1;
            let color = (item.team === 'red') ? '#F04124' : '#43ac6a';
            return {
                'y': value,
                'color': color,
                'name': item.game_datetime
            }
        });

        let chart = Highcharts.chart('win_loss_bar', {
            chart: {
                type: 'column',
                height: 200
            },
            title: {
                text: null
            },
            tooltip: {
                headerFormat: '',
                pointFormat: '<b>{point.name}</b>'
            },
            legend: {
                enabled: false
            },
            xAxis: {
                visible: false
            },
            yAxis: {
                min: -1,
                max: 1,

                title: {
                    text: "Latest"
                },
                labels: {
                    enabled: false
                }
            }
        });

        chart.addSeries({
            data: chartData
        })
    }

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

    function renderPositionSpider(type, ctrData, allData, redData, greenData) {
        let titleText = 'Score';
        let yMax = 10000;

        if (type === 'mvp') {
            titleText = 'MVP';
            yMax = 25;
        }

        $('#position_spider').highcharts({
            chart: {
                polar: true,
                type: 'line'
            },
            title: {
                text: 'Player Median ' + titleText + ' vs Center'
            },
            xAxis: {
                categories: ['Ammo Carrier', 'Commander', 'Heavy Weapons', 'Medic', 'Scout'],
                tickmarkPlacement: 'on',
                lineWidth: 0
            },
            yAxis: [{
                min: 0,
                max: yMax,
                labels: {
                    enabled: false
                }
            }],
            series: [{
                    name: 'All Median ' + titleText,
                    data: allData,
                    marker: {
                        symbol: 'square'
                    },
                    pointPlacement: 'on',
                    yAxis: 0,
                    color: '#5bc0de'
                },
                {
                    name: 'Red Median ' + titleText,
                    data: redData,
                    marker: {
                        symbol: 'square'
                    },
                    pointPlacement: 'on',
                    yAxis: 0,
                    visible: false,
                    color: '#F04124'
                },
                {
                    name: 'Green Median ' + titleText,
                    data: greenData,
                    marker: {
                        symbol: 'square'
                    },
                    pointPlacement: 'on',
                    yAxis: 0,
                    visible: false,
                    color: '#43AC6A'
                }, {
                    name: 'Center Median ' + titleText,
                    data: ctrData,
                    marker: {
                        symbol: 'square'
                    },
                    pointPlacement: 'on',
                    dashStyle: 'dash',
                    yAxis: 0,
                    color: '#222222'
                }
            ]
        });
    }

    function renderBoxPlot(type, all, red, green) {
        let titleText = (type === 'mvp') ? 'MVP' : 'Score';

        $('#position_box_plot').highcharts({
            chart: {
                type: 'boxplot'
            },
            title: {
                text: 'Player Median ' + titleText + ' Details'
            },
            tooltip: {
                pointFormat: '<span style="color:{point.color}">\u25CF</span> {series.name}<br />' +
                    'Maximum: {point.high}<br />' +
                    'Upper quartile: {point.q1}<br />' +
                    'Median: {point.median}<br />' +
                    'Mean: {point.mean}<br />' +
                    'Lower quartile: {point.q3}<br />' +
                    'Minimum: {point.low}<br />'
            },
            yAxis: {
                title: {
                    text: titleText
                }
            },
            xAxis: {
                categories: ['Commander', 'Heavy', 'Scout', 'Ammo', 'Medic'],
                title: {
                    text: null
                }
            },
            plotOptions: {
                boxplot: {
                    fillColor: '#eee',
                    lineWidth: 2,
                    medianColor: '#008cba',
                    medianWidth: 3,
                    stemColor: '#E99002',
                    stemDashStyle: 'dot',
                    stemWidth: 1,
                    whiskerColor: '#008cba',
                    whiskerLength: '20%',
                    whiskerWidth: 3
                }
            },
            series: [{
                    name: 'Red',
                    data: red,
                    visible: false,
                    color: '#F04124'
                },
                {
                    name: 'All',
                    data: all,
                    color: '#5bc0de'
                },
                {
                    name: 'Green',
                    data: green,
                    visible: false,
                    color: '#43AC6A'
                },
            ]
        });
    }

    function updateSpiderAndBoxPlot(type) {
        const params = new URLSearchParams(location.search);

        if (type === 'mvp') {
            params.set('type', 'mvp_points');
        } else if (type === 'score') {
            params.set('type', 'score');
        }

        var allUrl = '/players/getPlayerMedians.json?' + params.toString();

        params.set('player_id', <?= $id; ?>);
        var allPlayerUrl = '/players/getPlayerMedians.json?' + params.toString();

        params.set('team', 'red');
        var redPlayerUrl = '/players/getPlayerMedians.json?' + params.toString();

        params.set('team', 'green');
        var greenPlayerUrl = '/players/getPlayerMedians.json?' + params.toString();

        $.when(
            $.ajax({
                url: allUrl,
            }),
            $.ajax({
                url: allPlayerUrl,
            }),
            $.ajax({
                url: redPlayerUrl,
            }),
            $.ajax({
                url: greenPlayerUrl,
            })
        ).done(function(all, playerAll, playerRed, playerGreen) {
            rawData = [all, playerAll, playerRed, playerGreen];

            spiderData = rawData.map(function(item) {
                item = item[0]['data'];
                return [item['ammo'], item['commander'], item['heavy'], item['medic'], item[
                    'scout']]
            });

            boxData = rawData.map(function(item) {
                item = item[0]['data'];
                return [{
                        low: item['commander_min'],
                        q1: item['commander_lower'],
                        median: item['commander'],
                        q3: item['commander_upper'],
                        high: item['commander_max'],
                        mean: Math.round(item['commander_avg'] * 100) / 100
                    },
                    {
                        low: item['heavy_min'],
                        q1: item['heavy_lower'],
                        median: item['heavy'],
                        q3: item['heavy_upper'],
                        high: item['heavy_max'],
                        mean: Math.round(item['heavy_avg'] * 100) / 100
                    },
                    {
                        low: item['scout_min'],
                        q1: item['scout_lower'],
                        median: item['scout'],
                        q3: item['scout_upper'],
                        high: item['scout_max'],
                        mean: Math.round(item['scout_avg'] * 100) / 100
                    },
                    {
                        low: item['ammo_min'],
                        q1: item['ammo_lower'],
                        median: item['ammo'],
                        q3: item['ammo_upper'],
                        high: item['ammo_max'],
                        mean: Math.round(item['ammo_avg'] * 100) / 100
                    },
                    {
                        low: item['medic_min'],
                        q1: item['medic_lower'],
                        median: item['medic'],
                        q3: item['medic_upper'],
                        high: item['medic_max'],
                        mean: Math.round(item['medic_avg'] * 100) / 100
                    }
                ];
            });

            renderBoxPlot(type, boxData[1], boxData[2], boxData[3]);
            renderPositionSpider(type, spiderData[0], spiderData[1], spiderData[2], spiderData[3]);
        });
    }

    function updateWinLossPie() {
        const params = new URLSearchParams(location.search);
        const player_id = <?= $id; ?>;

        let hitUrl = '/Players/playerWinLossDetail/' + player_id + '.json?' + params.toString();

        $.ajax({
            url: hitUrl
        }).done(function(data) {
            renderWinLossPie(data);
        });
    }

    $("#spiderSelector :input").change(function() {
        if (this.id === 'option_mvp') {
            updateSpiderAndBoxPlot('mvp');
        }

        if (this.id === 'option_score') {
            updateSpiderAndBoxPlot('score');
        }
    });

    updateWinLossPie();
    updateSpiderAndBoxPlot('mvp');

    var overall_mvp_data = <?php echo $overall_mvp_json; ?>;
    var commander_mvp_data = <?php echo $commander_mvp_json; ?>;
    var heavy_mvp_data = <?php echo $heavy_mvp_json; ?>;
    var scout_mvp_data = <?php echo $scout_mvp_json; ?>;
    var ammo_mvp_data = <?php echo $ammo_mvp_json; ?>;
    var medic_mvp_data = <?php echo $medic_mvp_json; ?>;

    var overall_score_data = <?php echo $overall_score_json; ?>;
    var
        commander_score_data = <?php echo $commander_score_json; ?>;
    var heavy_score_data = <?php echo $heavy_score_json; ?>;
    var scout_score_data = <?php echo $scout_score_json; ?>;
    var ammo_score_data = <?php echo $ammo_score_json; ?>;
    var medic_score_data = <?php echo $medic_score_json; ?>;

    var overall_acc_data = <?php echo $overall_acc_json; ?>;
    var commander_acc_data = <?php echo $commander_acc_json; ?>;
    var heavy_acc_data = <?php echo $heavy_acc_json; ?>;
    var scout_acc_data = <?php echo $scout_acc_json; ?>;
    var ammo_acc_data = <?php echo $ammo_acc_json; ?>;
    var medic_acc_data = <?php echo $medic_acc_json; ?>;

    var overall_medic_data = <?php echo $overall_medic_json; ?>;
    var
        commander_medic_data = <?php echo $commander_medic_json; ?>;
    var heavy_medic_data = <?php echo $heavy_medic_json; ?>;
    var scout_medic_data = <?php echo $scout_medic_json; ?>;
    var ammo_medic_data = <?php echo $ammo_medic_json; ?>;
    var medic_medic_data = <?php echo $medic_medic_json; ?>;

    var
        overall_hitdiff_data = <?php echo $overall_hitdiff_json; ?>;
    var
        commander_hitdiff_data = <?php echo $commander_hitdiff_json; ?>;
    var heavy_hitdiff_data = <?php echo $heavy_hitdiff_json; ?>;
    var scout_hitdiff_data = <?php echo $scout_hitdiff_json; ?>;
    var ammo_hitdiff_data = <?php echo $ammo_hitdiff_json; ?>;
    var medic_hitdiff_data = <?php echo $medic_hitdiff_json; ?>;

    (overall_mvp_data.length < 1) ? line1 = [null]: "";
    (commander_mvp_data.length < 1) ? line2 = [null]: "";
    (heavy_mvp_data.length < 1) ? line3 = [null]: "";
    (scout_mvp_data.length < 1) ? line4 = [null]: "";
    (ammo_mvp_data.length < 1) ? line5 = [null]: "";
    (medic_mvp_data.length < 1) ? line6 = [null]: "";
    (overall_score_data.length < 1) ? line7 = [null]: "";
    (commander_score_data.length < 1) ? line8 = [null]: "";
    (heavy_score_data.length < 1) ? line9 = [null]: "";
    (scout_score_data.length < 1) ? line10 = [null]: "";
    (ammo_score_data.length < 1) ? line11 = [null]: "";
    (medic_score_data.length < 1) ? line12 = [null]: "";

    $('#acc_plot').highcharts({
        chart: {
            alignTicks: false,
        },
        title: {
            text: 'Accuracy'
        },
        legend: {
            enabled: true,
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'middle',
            borderWidth: 0
        },
        yAxis: {
            title: {
                text: 'Accuracy'
            },
            max: 100,
            tickInterval: 5
        },
        xAxis: [{
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: overall_acc_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: commander_acc_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: heavy_acc_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: scout_acc_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: ammo_acc_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: medic_acc_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            }
        ],
        series: [{
                id: 'overall',
                name: 'All Positions (Scatter)',
                type: 'scatter',
                data: overall_acc_data,
                visible: true,
                xAxis: 0
            },
            {
                id: 'commander',
                name: 'Commander (Scatter)',
                type: 'scatter',
                data: commander_acc_data,
                visible: false,
                xAxis: 1
            },
            {
                id: 'heavy',
                name: 'Heavy Weapons (Scatter)',
                type: 'scatter',
                data: heavy_acc_data,
                visible: false,
                xAxis: 2
            },
            {
                id: 'scout',
                name: 'Scout (Scatter)',
                type: 'scatter',
                data: scout_acc_data,
                visible: false,
                xAxis: 3
            },
            {
                id: 'ammo',
                name: 'Ammo Carrier (Scatter)',
                type: 'scatter',
                data: ammo_acc_data,
                visible: false,
                xAxis: 4
            },
            {
                id: 'medic',
                name: 'Medic (Scatter)',
                type: 'scatter',
                data: medic_acc_data,
                visible: false,
                xAxis: 5
            },
            {
                name: 'All Positions',
                type: 'sma',
                linkedTo: 'overall',
                showInLegend: true,
                periods: Math.max(Math.round(overall_acc_data.length / 10), 10),
                xAxis: 0
            },
            {
                name: 'Commander',
                type: 'sma',
                linkedTo: 'commander',
                showInLegend: true,
                periods: Math.max(Math.round(commander_acc_data.length / 10), 10),
                xAxis: 1
            },
            {
                name: 'Heavy Weapons',
                type: 'sma',
                linkedTo: 'heavy',
                showInLegend: true,
                periods: Math.max(Math.round(heavy_acc_data.length / 10), 10),
                xAxis: 2
            },
            {
                name: 'Scout',
                type: 'sma',
                linkedTo: 'scout',
                showInLegend: true,
                periods: Math.max(Math.round(scout_acc_data.length / 10), 10),
                xAxis: 3
            },
            {
                name: 'Ammo Carrier',
                type: 'sma',
                linkedTo: 'ammo',
                showInLegend: true,
                periods: Math.max(Math.round(medic_acc_data.length / 10), 10),
                xAxis: 4
            },
            {
                name: 'Medic',
                type: 'sma',
                linkedTo: 'medic',
                showInLegend: true,
                periods: Math.max(Math.round(overall_acc_data.length / 10), 10),
                xAxis: 5
            }
        ]
    });

    $('#hitdiff_plot').highcharts({
        chart: {
            alignTicks: false,
        },
        title: {
            text: 'Hit Diff'
        },
        legend: {
            enabled: true,
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'middle',
            borderWidth: 0
        },
        yAxis: {
            title: {
                text: 'HitDiff'
            },
            max: 5,
            tickInterval: 1
        },
        xAxis: [{
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: overall_hitdiff_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: commander_hitdiff_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: heavy_hitdiff_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: scout_hitdiff_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: ammo_hitdiff_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: medic_hitdiff_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            }
        ],
        series: [{
                id: 'overall',
                name: 'All Positions (Scatter)',
                type: 'scatter',
                data: overall_hitdiff_data,
                visible: true,
                xAxis: 0
            },
            {
                id: 'commander',
                name: 'Commander (Scatter)',
                type: 'scatter',
                data: commander_hitdiff_data,
                visible: false,
                xAxis: 1
            },
            {
                id: 'heavy',
                name: 'Heavy Weapons (Scatter)',
                type: 'scatter',
                data: heavy_hitdiff_data,
                visible: false,
                xAxis: 2
            },
            {
                id: 'scout',
                name: 'Scout (Scatter)',
                type: 'scatter',
                data: scout_hitdiff_data,
                visible: false,
                xAxis: 3
            },
            {
                id: 'ammo',
                name: 'Ammo Carrier (Scatter)',
                type: 'scatter',
                data: ammo_hitdiff_data,
                visible: false,
                xAxis: 4
            },
            {
                id: 'medic',
                name: 'Medic (Scatter)',
                type: 'scatter',
                data: medic_hitdiff_data,
                visible: false,
                xAxis: 5
            },
            {
                name: 'All Positions',
                type: 'sma',
                linkedTo: 'overall',
                showInLegend: true,
                periods: Math.max(Math.round(overall_hitdiff_data.length / 10), 10),
                xAxis: 0
            },
            {
                name: 'Commander',
                type: 'sma',
                linkedTo: 'commander',
                showInLegend: true,
                periods: Math.max(Math.round(commander_hitdiff_data.length / 10), 10),
                xAxis: 1
            },
            {
                name: 'Heavy Weapons',
                type: 'sma',
                linkedTo: 'heavy',
                showInLegend: true,
                periods: Math.max(Math.round(heavy_hitdiff_data.length / 10), 10),
                xAxis: 2
            },
            {
                name: 'Scout',
                type: 'sma',
                linkedTo: 'scout',
                showInLegend: true,
                periods: Math.max(Math.round(scout_hitdiff_data.length / 10), 10),
                xAxis: 3
            },
            {
                name: 'Ammo Carrier',
                type: 'sma',
                linkedTo: 'ammo',
                showInLegend: true,
                periods: Math.max(Math.round(medic_hitdiff_data.length / 10), 10),
                xAxis: 4
            },
            {
                name: 'Medic',
                type: 'sma',
                linkedTo: 'medic',
                showInLegend: true,
                periods: Math.max(Math.round(overall_hitdiff_data.length / 10), 10),
                xAxis: 5
            }
        ]
    });

    $('#mvp_plot').highcharts({
        chart: {
            alignTicks: false
        },
        title: {
            text: 'MVP Points'
        },
        legend: {
            enabled: true,
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'middle',
            borderWidth: 0
        },
        yAxis: {
            title: {
                text: 'Score'
            },
            max: 25,
            tickInterval: 1
        },
        xAxis: [{
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: overall_mvp_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: commander_mvp_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: heavy_mvp_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: scout_mvp_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: ammo_mvp_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: medic_mvp_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            }
        ],
        series: [{
                id: 'overall',
                name: 'All Positions (Scatter)',
                type: 'scatter',
                data: overall_mvp_data,
                visible: true,
                xAxis: 0
            },
            {
                id: 'commander',
                name: 'Commander (Scatter)',
                type: 'scatter',
                data: commander_mvp_data,
                visible: false,
                xAxis: 1
            },
            {
                id: 'heavy',
                name: 'Heavy Weapons (Scatter)',
                type: 'scatter',
                data: heavy_mvp_data,
                visible: false,
                xAxis: 2
            },
            {
                id: 'scout',
                name: 'Scout (Scatter)',
                type: 'scatter',
                data: scout_mvp_data,
                visible: false,
                xAxis: 3
            },
            {
                id: 'ammo',
                name: 'Ammo Carrier (Scatter)',
                type: 'scatter',
                data: ammo_mvp_data,
                visible: false,
                xAxis: 4
            },
            {
                id: 'medic',
                name: 'Medic (Scatter)',
                type: 'scatter',
                data: medic_mvp_data,
                visible: false,
                xAxis: 5
            },
            {
                name: 'All Positions',
                type: 'sma',
                linkedTo: 'overall',
                showInLegend: true,
                periods: Math.max(Math.round(overall_mvp_data.length / 10), 10),
                xAxis: 0
            },
            {
                name: 'Commander',
                type: 'sma',
                linkedTo: 'commander',
                showInLegend: true,
                periods: Math.max(Math.round(commander_mvp_data.length / 10), 10),
                xAxis: 1
            },
            {
                name: 'Heavy Weapons',
                type: 'sma',
                linkedTo: 'heavy',
                showInLegend: true,
                periods: Math.max(Math.round(heavy_mvp_data.length / 10), 10),
                xAxis: 2
            },
            {
                name: 'Scout',
                type: 'sma',
                linkedTo: 'scout',
                showInLegend: true,
                periods: Math.max(Math.round(scout_mvp_data.length / 10), 10),
                xAxis: 3
            },
            {
                name: 'Ammo Carrier',
                type: 'sma',
                linkedTo: 'ammo',
                showInLegend: true,
                periods: Math.max(Math.round(ammo_mvp_data.length / 10), 10),
                xAxis: 4
            },
            {
                name: 'Medic',
                type: 'sma',
                linkedTo: 'medic',
                showInLegend: true,
                periods: Math.max(Math.round(medic_mvp_data.length / 10), 10),
                xAxis: 5
            }
        ]
    });

    $('#score_plot').highcharts({
        chart: {
            alignTicks: false
        },
        title: {
            text: 'Score'
        },
        legend: {
            enabled: true,
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'middle',
            borderWidth: 0
        },
        yAxis: {
            title: {
                text: 'Score'
            },
            max: 15000,
            tickInterval: 1000
        },
        xAxis: [{
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: overall_score_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: commander_score_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: heavy_score_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: scout_score_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: ammo_score_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: medic_score_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            }
        ],
        series: [{
                id: 'overall',
                name: 'All Positions (Scatter)',
                type: 'scatter',
                data: overall_score_data,
                visible: true,
                xAxis: 0
            },
            {
                id: 'commander',
                name: 'Commander (Scatter)',
                type: 'scatter',
                data: commander_score_data,
                visible: false,
                xAxis: 1
            },
            {
                id: 'heavy',
                name: 'Heavy Weapons (Scatter)',
                type: 'scatter',
                data: heavy_score_data,
                visible: false,
                xAxis: 2
            },
            {
                id: 'scout',
                name: 'Scout (Scatter)',
                type: 'scatter',
                data: scout_score_data,
                visible: false,
                xAxis: 3
            },
            {
                id: 'ammo',
                name: 'Ammo Carrier (Scatter)',
                type: 'scatter',
                data: ammo_score_data,
                visible: false,
                xAxis: 4
            },
            {
                id: 'medic',
                name: 'Medic (Scatter)',
                type: 'scatter',
                data: medic_score_data,
                visible: false,
                xAxis: 5
            },
            {
                name: 'All Positions',
                type: 'sma',
                linkedTo: 'overall',
                showInLegend: true,
                periods: Math.max(Math.round(overall_score_data.length / 10), 10),
                xAxis: 0
            },
            {
                name: 'Commander',
                type: 'sma',
                linkedTo: 'commander',
                showInLegend: true,
                periods: Math.max(Math.round(commander_score_data.length / 10), 10),
                xAxis: 1
            },
            {
                name: 'Heavy Weapons',
                type: 'sma',
                linkedTo: 'heavy',
                showInLegend: true,
                periods: Math.max(Math.round(heavy_score_data.length / 10), 10),
                xAxis: 2
            },
            {
                name: 'Scout',
                type: 'sma',
                linkedTo: 'scout',
                showInLegend: true,
                periods: Math.max(Math.round(scout_score_data.length / 10), 10),
                xAxis: 3
            },
            {
                name: 'Ammo Carrier',
                type: 'sma',
                linkedTo: 'ammo',
                showInLegend: true,
                periods: Math.max(Math.round(ammo_score_data.length / 10), 10),
                xAxis: 4
            },
            {
                name: 'Medic',
                type: 'sma',
                linkedTo: 'medic',
                showInLegend: true,
                periods: Math.max(Math.round(medic_score_data.length / 10), 10),
                xAxis: 5
            }
        ]
    });

    $('#medic_plot').highcharts({
        chart: {
            alignTicks: false
        },
        title: {
            text: 'Medic Hits'
        },
        legend: {
            enabled: true,
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'middle',
            borderWidth: 0
        },
        yAxis: {
            title: {
                text: 'Medic Hits'
            },
            min: -5,
            max: 15,
            tickInterval: 2
        },
        xAxis: [{
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: overall_medic_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: commander_medic_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: heavy_medic_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: scout_medic_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: ammo_medic_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            },
            {
                maxPadding: 0.1,
                minPadding: 0.1,
                min: 5,
                max: medic_medic_data.length + 5,
                labels: {
                    enabled: false
                },
                tickWidth: 0
            }
        ],
        series: [{
                id: 'overall',
                name: 'All Positions (Scatter)',
                type: 'scatter',
                data: overall_medic_data,
                visible: true,
                xAxis: 0
            },
            {
                id: 'commander',
                name: 'Commander (Scatter)',
                type: 'scatter',
                data: commander_medic_data,
                visible: false,
                xAxis: 1
            },
            {
                id: 'heavy',
                name: 'Heavy Weapons (Scatter)',
                type: 'scatter',
                data: heavy_medic_data,
                visible: false,
                xAxis: 2
            },
            {
                id: 'scout',
                name: 'Scout (Scatter)',
                type: 'scatter',
                data: scout_medic_data,
                visible: false,
                xAxis: 3
            },
            {
                id: 'ammo',
                name: 'Ammo Carrier (Scatter)',
                type: 'scatter',
                data: ammo_medic_data,
                visible: false,
                xAxis: 4
            },
            {
                id: 'medic',
                name: 'Medic (Scatter)',
                type: 'scatter',
                data: medic_medic_data,
                visible: false,
                xAxis: 5
            },
            {
                name: 'All Positions',
                type: 'sma',
                linkedTo: 'overall',
                showInLegend: true,
                periods: Math.max(Math.round(overall_medic_data.length / 10), 10),
                xAxis: 0
            },
            {
                name: 'Commander',
                type: 'sma',
                linkedTo: 'commander',
                showInLegend: true,
                periods: Math.max(Math.round(commander_medic_data.length / 10), 10),
                xAxis: 1
            },
            {
                name: 'Heavy Weapons',
                type: 'sma',
                linkedTo: 'heavy',
                showInLegend: true,
                periods: Math.max(Math.round(heavy_medic_data.length / 10), 10),
                xAxis: 2
            },
            {
                name: 'Scout',
                type: 'sma',
                linkedTo: 'scout',
                showInLegend: true,
                periods: Math.max(Math.round(scout_medic_data.length / 10), 10),
                xAxis: 3
            },
            {
                name: 'Ammo Carrier',
                type: 'sma',
                linkedTo: 'ammo',
                showInLegend: true,
                periods: Math.max(Math.round(ammo_medic_data.length / 10), 10),
                xAxis: 4
            },
            {
                name: 'Medic',
                type: 'sma',
                linkedTo: 'medic',
                showInLegend: true,
                periods: Math.max(Math.round(medic_medic_data.length / 10), 10),
                xAxis: 5
            }
        ]
    });

    $('#game_list thead tr th.searchable').each(function() {
        var title = $('#game_list thead th').eq($(this).index()).text();
        $(this).html('<input type="text" placeholder="Search ' + title + '" />');
    });

    $("#game_list thead tr th input").on('keyup change', function() {
        gameListTable
            .column($(this).parent().index() + ':visible')
            .search(this.value)
            .draw();
    });

    var gameListTable = $('#game_list').DataTable({
        processing: true,
        orderCellsTop: true,
        scrollX: true,
        fixedColumns: true,
        dom: '<"H"lr>t<"F"ip>',
        columns: [{
                data: function(row, type, val, meta) {
                    if (type === 'display') {
                        if (row.game_winner == 'green')
                            return `<span class="text-success">${row.game_name_link}</span>`;
                        else
                            return `<span class="text-danger">${row.game_name_link}</span>`;
                    }
                    return row.game_name;
                }
            },
            {
                "data": "game_datetime"
            },
            {
                "data": "winloss"
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display') {
                        let team = row.team;

                        if (row.team_name != null)
                            team = `${team} - ${row.team_name}`;

                        if (row.team == 'green')
                            return `<span class="text-capitalize text-success">${team}</span>`;
                        else
                            return `<span class="text-capitalize text-danger">${team}</span>`;

                    }
                    return row.team;
                }
            },
            {
                "data": "position"
            },
            {
                "data": "score"
            },
            {
                "data": "max_score"
            },
            {
                "data": "score_ratio"
            },
            {
                "data": "accuracy"
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display') {
                        return `<a href="#" data-toggle="modal" data-target="#genericModal" data-title="MVP Details" data-modalsize="modal-sm" target="/scorecards/getMVPBreakdown/${row.scorecard_id}.json?${params.toString()}">${row.mvp_points} <i class="far fa-chart-bar"></i></a>`;
                    }
                    return row.mvp_points;
                }
            },
            {
                "data": "lives_left"
            },
            {
                "data": "shots_left"
            },
            {
                "data": "shot_opponent"
            },
            {
                "data": "times_zapped"
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display') {
                        return `<a href="#" data-toggle="modal" data-target="#genericModal" data-title="Hit Details" data-modalsize="modal-lg" target="/scorecards/getHitBreakdown/${row.player_id}/${row.game_id}.json?${params.toString()}">${row.hit_diff} <i class="far fa-chart-bar"></i></a>`;
                    }
                    return row.hit_diff;
                }
            },
            {
                "data": "missile_hits"
            },
            {
                "data": "times_missiled"
            },
            {
                "data": "medic_hits"
            },
            {
                "data": "medic_nukes"
            },
            {
                "data": "shot_3hit"
            },
            {
                "data": "shot_team"
            },
            {
                "data": "missiled_team"
            },
            {
                "data": "own_medic_hits"
            },
            {
                "data": "nukes_activated"
            },
            {
                "data": "nukes_detonated"
            },
            {
                "data": "nukes_canceled"
            },
            {
                "data": "own_nuke_cancels"
            },
            {
                "data": "scout_rapid"
            },
            {
                "data": "boost"
            },
            {
                "data": "resupplies"
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display') {
                        return `<a rel="noopener noreferrer" target="_blank" href="http://lfstatsscorecards.objects-us-east-1.dream.io/${row.pdf}.pdf">PDF</a>`;
                    }
                    return row.pdf;
                }
            },
        ],
        "order": [
            [1, "desc"]
        ]
    });

    var targetsTable = $('#target_stats').DataTable({
        processing: true,
        orderCellsTop: true,
        ajax: {
            url: "<?php echo html_entity_decode($this->Html->url(array('controller' => 'Scorecards', 'action' => 'getPlayerTargetsBreakdown', $id, 'ext' => 'json'))); ?>"
        },
        columns: [{
                "data": "position"
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display' && row.overall != 'n/a') {
                        result = Math.round(row.overall * 1000) / 1000;
                        if (result == 1)
                            return '1.000'
                        else
                            return result
                    }
                    return row.overall;
                }
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display' && row.survives != 'n/a') {
                        result = Math.round(row.survives * 1000) / 1000;
                        if (result == 1)
                            return '1.000'
                        else
                            return result
                    }
                    return row.survives;
                }
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display' && row.survivesElim != 'n/a') {
                        result = Math.round(row.survivesElim * 1000) / 1000;
                        if (result == 1)
                            return '1.000'
                        else
                            return result
                    }
                    return row.survivesElim;
                }
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display' && row.dieElim != 'n/a') {
                        result = Math.round(row.dieElim * 1000) / 1000;
                        if (result == 1)
                            return '1.000'
                        else
                            return result
                    }
                    return row.dieElim;
                }
            },
            {
                data: function(row, type, val, meta) {
                    if (type === 'display' && row.elim != 'n/a') {
                        result = Math.round(row.elim * 1000) / 1000;
                        if (result == 1)
                            return '1.000'
                        else
                            return result
                    }
                    return row.elim;
                }
            }
        ],
        order: [
            [0, "asc"]
        ]
    });

    var headToHeadTable = $('#head_to_head').DataTable({
        "processing": true,
        "columns": [{
                "data": "name"
            },
            {
                "data": "hits"
            },
            {
                "data": "hit_by"
            },
            {
                "data": "hit_ratio"
            },
            {
                "data": "missiles"
            },
            {
                "data": "missile_by"
            },
            {
                "data": "missile_ratio"
            },
            {
                "data": "games_played"
            }
        ],
        "order": [
            [1, "desc"]
        ]
    });

    $.ajax({
        url: "<?php echo html_entity_decode($this->Html->url(array('controller' => 'Scorecards', 'action' => 'playerScorecards', $id, 'ext' => 'json'))); ?>"
    }).done(function(response) {
        $('#game_list').DataTable().clear().rows.add(response.data).draw();

        var winLossBarData = response.data.slice(0, 25);
        renderWinLossBar(winLossBarData);
    })

    function updateHeadTable() {
        const params = new URLSearchParams(location.search);
        const player_id = <?= $id; ?>

        $.each($("#headPlayerPosSelector input:checked"), function() {
            let position = this.value
            params.set('player_' + position, position)
        })

        $.each($("#headTargetPosSelector input:checked"), function() {
            let position = this.value
            params.set('target_' + position, position)
        })

        params.set('team_flag', $("#headTeamSelector input:checked").val());

        let hitUrl = '/Scorecards/getPlayerHitBreakdown/' + player_id + '.json?' + params
            .toString();

        $('#head_to_head').DataTable().ajax.url(hitUrl).load();
    }

    $("#applyChanges").click(function() {
        updateHeadTable()
    });

    updateHeadTable()
});
</script>