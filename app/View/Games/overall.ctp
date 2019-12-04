<?php echo $this->element('breadcrumbs'); ?>
<hr>
<h4 class="my-4">
    Wins By Color
</h4>
<div id="win_loss_chart"></div>
<h4 class="my-4">
    Median MVP and Score
</h4>
</div>
<div class="row">
    <div class="col-sm-4 offset-sm-4">
        <div id="medianSelector" class="btn-group btn-group-toggle" data-toggle="buttons">
            <label class="btn btn-outline-info active">
                <input type="radio" name="options" id="option_mvp" autocomplete="off" checked>MVP
            </label>
            <label class="btn btn-outline-info">
                <input type="radio" name="options" id="option_score" autocomplete="off">Score
            </label>
        </div>
    </div>
</div>
<div id="mvp_box_plot"></div>
<div id="mvp_breakdown_chart"></div>
<h4 class="my-4">
    Average Team Scores
</h4>
<table class="table table-striped table-bordered table-hover table-sm" id="avg_scores">
    <thead>
        <th>Win Type</th>
        <th>Green Score</th>
        <th>Red Score</th>
        <thead>
</table>
<script type="text/javascript">
function overallData(data) {
    var non_elim_wins = [
        ["Non-Elim Wins", data['winlossdetail']['non_elim_wins_from_red']],
        ["Non-Elim Wins", data['winlossdetail']['non_elim_wins_from_green']]
    ];
    var elim_wins = [
        ["Elim Wins", data['winlossdetail']['elim_wins_from_red']],
        ["Elim Wins", data['winlossdetail']['elim_wins_from_green']]
    ];

    var total_games = data['winlossdetail']['non_elim_wins_from_red'] + data['winlossdetail'][
        'non_elim_wins_from_green'
    ] + data['winlossdetail']['elim_wins_from_red'] + data['winlossdetail']['elim_wins_from_green'];

    $('#win_loss_chart').highcharts({
        chart: {
            type: 'bar',
            height: 200
        },
        title: {
            text: null
        },
        xAxis: {
            categories: ['Red', 'Green']
        },
        yAxis: {
            title: {
                text: 'Wins'
            }
        },
        tooltip: {
            pointFormatter: function() {
                let winPercent = Math.round((this.y / total_games) * 100) + "%";
                return this.y + " Wins (" + winPercent + ")";
            }
        },
        legend: {
            enabled: false
        },
        plotOptions: {
            bar: {
                stacking: 'normal',
                groupPadding: 0,
                pointPadding: 0.1
            }
        },
        series: [{
                name: "Non-Elim Wins",
                data: non_elim_wins,
                colorByPoint: true,
                colors: ["#D7280B", "#2A9351"]
            },
            {
                name: "Elim Wins",
                data: elim_wins,
                colorByPoint: true,
                colors: ["#F04124", "#43ac6a"]
            }
        ]
    });

    $('#avg_scores').DataTable({
        "destroy": true,
        "autoWidth": false,
        "searching": false,
        "info": false,
        "paging": false,
        "ordering": false,
        "data": data['scoredetail'],
        "columns": [{
                "data": "Game"
            },
            {
                "data": "green_score",
                "render": function(data, type, row, meta) {
                    return parseFloat(data).toFixed(2);
                }
            },
            {
                "data": "red_score",
                "render": function(data, type, row, meta) {
                    return parseFloat(data).toFixed(2);
                }
            }
        ],
    });
}

function renderBoxPlot(type, all, red, green) {
    let titleText = (type === 'mvp') ? 'MVP' : 'Score';

    $('#mvp_box_plot').highcharts({
        chart: {
            type: 'boxplot'
        },
        title: {
            text: null
        },
        tooltip: {
            pointFormat: '<span style="color:{point.color}">\u25CF</span> {series.name}<br />' +
                'Maximum: {point.high}<br />' +
                'Upper quartile: {point.q3}<br />' +
                'Median: {point.median}<br />' +
                'Mean: {point.mean}<br />' +
                'Lower quartile: {point.q1}<br />' +
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

function updateBoxPlot(type) {
    const params = new URLSearchParams(location.search);

    if (type === 'mvp') {
        params.set('type', 'mvp_points');
    } else if (type === 'score') {
        params.set('type', 'score');
    }

    var allUrl = '/players/getPlayerMedians.json?' + params.toString();

    params.set('team', 'red');
    var redUrl = '/players/getPlayerMedians.json?' + params.toString();

    params.set('team', 'green');
    var greenUrl = '/players/getPlayerMedians.json?' + params.toString();

    $.when(
        $.ajax({
            url: allUrl,
        }),
        $.ajax({
            url: redUrl,
        }),
        $.ajax({
            url: greenUrl,
        })
    ).done(function(all, red, green) {
        rawData = [all, red, green];

        allData = rawData.map(function(item) {
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

        renderBoxPlot(type, allData[0], allData[1], allData[2]);
    });
}

function renderMVPChart(data) {
    var allData = data.data.all;
    var commanderData = data.data['Commander'];
    var heavyData = data.data['Heavy Weapons'];
    var scoutData = data.data['Scout'];
    var ammoData = data.data['Ammo Carrier'];
    var medicData = data.data['Medic'];

    Highcharts.chart('mvp_breakdown_chart', {
        chart: {
            type: 'bar'
        },
        title: {
            text: 'Rusty, where does MVP come from?'
        },
        xAxis: {
            categories: ['All', 'Commander', 'Heavy Weapons', 'Scout', 'Ammo Carrier', 'Medic']
        },
        yAxis: {
            min: 0,
            title: {
                text: 'Total MVP'
            }
        },
        legend: {
            reversed: true
        },
        plotOptions: {
            series: {
                stacking: 'normal'
            }
        },
        series: [{
            name: 'Missiled Opponent',
            data: [allData.missiled_opponent, commanderData.missiled_opponent, heavyData
                .missiled_opponent,
                scoutData.missiled_opponent, ammoData.missiled_opponent, medicData
                .missiled_opponent
            ]
        }, {
            name: 'Nukes Detonated',
            data: [allData.nukes_detonated, commanderData.nukes_detonated, heavyData
                .nukes_detonated,
                scoutData.nukes_detonated, ammoData.nukes_detonated, medicData
                .nukes_detonated
            ]
        }, {
            name: 'Nukes Canceled',
            data: [allData.nukes_canceled, commanderData.nukes_canceled, heavyData
                .nukes_canceled,
                scoutData.nukes_canceled, ammoData.nukes_canceled, medicData
                .nukes_canceled
            ]
        }, {
            name: 'Medic Hits',
            data: [allData.medic_hits, commanderData.medic_hits, heavyData
                .medic_hits,
                scoutData.medic_hits, ammoData.medic_hits, medicData
                .medic_hits
            ]
        }, {
            name: 'Rapid Fire',
            data: [allData.rapid_fire, commanderData.rapid_fire, heavyData
                .rapid_fire,
                scoutData.rapid_fire, ammoData.rapid_fire, medicData
                .rapid_fire
            ]
        }, {
            name: 'Shoot 3-Hit',
            data: [allData.shoot_3_hit, commanderData.shoot_3_hit, heavyData
                .shoot_3_hit,
                scoutData.shoot_3_hit, ammoData.shoot_3_hit, medicData
                .shoot_3_hit
            ]
        }, {
            name: 'Ammo Boost',
            data: [allData.ammo_boost, commanderData.ammo_boost, heavyData
                .ammo_boost,
                scoutData.ammo_boost, ammoData.ammo_boost, medicData
                .ammo_boost
            ]
        }, {
            name: 'Life Boost',
            data: [allData.life_boost, commanderData.life_boost, heavyData
                .life_boost,
                scoutData.life_boost, ammoData.life_boost, medicData
                .life_boost
            ]
        }, {
            name: 'Medic Survive Bonus',
            data: [allData.medic_survive_bonus, commanderData.medic_survive_bonus, heavyData
                .medic_survive_bonus,
                scoutData.medic_survive_bonus, ammoData.medic_survive_bonus, medicData
                .medic_survive_bonus
            ]
        }, {
            name: 'Medic Score Bonus',
            data: [allData.medic_score_bonus, commanderData.medic_score_bonus, heavyData
                .medic_score_bonus,
                scoutData.medic_score_bonus, ammoData.medic_score_bonus, medicData
                .medic_score_bonus
            ]
        }, {
            name: 'Elim Bonus',
            data: [allData.elim_bonus, commanderData.elim_bonus, heavyData
                .elim_bonus,
                scoutData.elim_bonus, ammoData.elim_bonus, medicData
                .elim_bonus
            ]
        }, {
            name: 'Position Bonus',
            data: [allData.position_bonus, commanderData.position_bonus, heavyData.position_bonus,
                scoutData.position_bonus, ammoData.position_bonus, medicData.position_bonus
            ]
        }, {
            name: 'Accuracy',
            data: [allData.acc, commanderData.acc, heavyData.acc,
                scoutData.acc, ammoData.acc, medicData.acc
            ]
        }]
    });
}

$(document).ready(function() {
    $("#medianSelector :input").change(function() {
        if (this.id === 'option_mvp') {
            updateBoxPlot('mvp');
        }

        if (this.id === 'option_score') {
            updateBoxPlot('score');
        }
    });

    $.ajax({
        url: '<?php echo html_entity_decode($this->Html->url(['action' => 'overallWinLossDetail', 'ext' => 'json'])); ?>'
    }).done(function(response) {
        overallData(response);
    });

    $.ajax({
        url: '<?php echo html_entity_decode($this->Html->url(['controller' => 'scorecards', 'action' => 'getMVPDetailsBySource', 'ext' => 'json'])); ?>'
    }).done(function(response) {
        renderMVPChart(response);
    });

    updateBoxPlot('mvp');
});
</script>