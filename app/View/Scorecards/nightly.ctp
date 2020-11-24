<?php echo $this->element('breadcrumbs'); ?>
<hr>
<form id="nightlyNightlyForm">
    <div class="form-group">
        <label for="nightlySelectDate">Select Date:</label>
        <select class="form-control-sm" id="nightlySelectDate">
            <?php foreach ($game_dates as $game_date) { ?>
            <option value="<?php echo $game_date; ?>" <?php echo ($game_date == $current_date) ? 'selected' : ''; ?>>
                <?php echo $game_date; ?>
            </option>
            <?php } ?>
        </select>
    </div>
</form>
<h4 class="my-4">Overall <?php echo $this->Html->link('(details)', ['controller' => 'scorecards', 'action' => 'nightlyDetailed'], ['class' => 'h6 text-muted']); ?>
</h4>
<div>
    <table class="table table-striped table-bordered table-hover table-sm nowrap" style="width:100%" id="overall">
        <thead>
            <th>#</th>
            <th>Name</th>
            <th>Game</th>
            <th>Position</th>
            <th>Score</th>
            <th>MVP</th>
            <th>Hit Diff</th>
            <th>Medic Hits</th>
            <th>Accuracy</th>
            <th>Shot Team</th>
        </thead>
    </table>
</div>
<hr>
<h4 class="my-4">Summary Stats</h4>
<div>
    <table class="table table-striped table-bordered table-hover table-sm nowrap" style="width:100%" id="summary_stats">
        <thead>
            <th>#</th>
            <th>Name</th>
            <th>Min Score</th>
            <th>Avg Score</th>
            <th>Max Score</th>
            <th>Min MVP</th>
            <th>Avg MVP</th>
            <th>Max MVP</th>
            <th>Avg Acc</th>
            <th>Hit Diff</th>
            <th>Medic Hits</th>
            <th>Elim Rate</th>
            <th>Won/Played</th>
        </thead>
    </table>
</div>
<hr>
<h4 class="my-4">Medic Hits</h4>
<div>
    <table class="table table-striped table-bordered table-hover table-sm nowrap" style="width:100%" id="medic_hits">
        <thead>
            <th>#</th>
            <th>Name</th>
            <th>Medic Hits (All)</th>
            <th>Avg Medic Hits (All)</th>
            <th>Games Played (All)</th>
            <th>Medic Hits (Non-Resup)</th>
            <th>Avg Medic Hits (Non-Resup)</th>
            <th>Games Played (Non-Resup)</th>
        </thead>
    </table>
</div>
<hr>
<h4 class="my-4">Games Played</h4>
<ul id="game_list_group" class="list-group"></ul>
<script type="text/javascript">
    $(document).ready(function() {
        const params = new URLSearchParams(location.search);
        params.set('date', '<?php echo $current_date; ?>');

        function updateGameList(params) {
            $.ajax({
                url: `/games/getGameList.json?${params.toString()}`,
            }).done(function(response) {
                $('#game_list_group').empty();

                response.data.forEach(function(element) {
                    let $wrapper = $('<div>', {
                        class: 'list-group-item'
                    });
                    let $heading = $('<div>', {
                        class: 'list-group-item-heading'
                    });
                    let $body = $('<div>', {
                        class: 'list-group-item-text'
                    });
                    let $gameLink = $('<a>', {
                        href: '/games/view/' + element.Game.id + '?' + params.toString()
                    });
                    let $pdfLink = $('<a>', {
                        href: 'https://lfstats-scorecards.s3.amazonaws.com/' +
                            element.Game.pdf_id + '.pdf',
                        target: '_blank'
                    }).text('PDF');

                    $gameLink.html('<h5>' + element.Game.game_name + ' - ' + element.Game
                        .game_datetime +
                        '</h5>');
                    $heading.append($gameLink);

                    let red_team = '<span class="text-danger">Red Team: ' + (element.Game
                            .red_score +
                            element.Game.red_adj) +
                        '</span>';
                    let green_team = '<span class="text-success">Green Team: ' + (element.Game
                            .green_score +
                            element.Game.green_adj) +
                        '</span>';

                    $wrapper.append($heading);
                    if (element.Game.winner === 'red') {
                        $body.append('<strong>' + red_team + '</strong> | ' + green_team +
                            ' - ');
                    } else {
                        $body.append('<strong>' + green_team + '</strong> | ' + red_team +
                            ' - ');
                    }
                    $body.append($pdfLink);
                    $wrapper.append($body);
                    $('#game_list_group').append($wrapper);
                });
            });
        }

        updateGameList(params);

        var overall = $('#overall').DataTable({
            deferRender: true,
            scrollX: true,
            fixedColumns: {
                leftColumns: 2
            },
            ajax: {
                url: `/scorecards/nightlyScorecards.json?${params.toString()}`,
                dataSrc: function(response) {
                    var result = response.data.map(function(element) {
                        let positionClass = (element.Scorecard.team === 'red') ?
                            'text-danger' : 'text-success';
                        let gameClass = (element.Game.winner === 'red') ? 'text-danger' :
                            'text-success';
                        let hitDiff = Math.round(element.Scorecard.shot_opponent / Math.max(
                                element.Scorecard.times_zapped, 1) *
                            100) / 100;
                        let mvp = Number.parseFloat(element.Scorecard.mvp_points).toFixed(
                            2);

                        let playerLink =
                            `<a href="/players/view/${element.Scorecard.player_id}?${params.toString()}">${element.Scorecard.player_name}</a>`;
                        let gameLink =
                            `<a href="/games/view/${element.Game.id}?${params.toString()}" class="${gameClass}">${element.Game.game_name}</a>`;
                        let mvpLink =
                            `<a href="#" data-toggle="modal" data-target="#genericModal" data-title="MVP Details" data-modalsize="modal-sm" target="/scorecards/getMVPBreakdown/${element.Scorecard.id}.json?${params.toString()}">${mvp} <i class="material-icons">bar_chart</i></a>`;
                        let hitDiffLink =
                            `<a href="#" data-toggle="modal" data-target="#genericModal" data-title="Hit Details" data-modalsize="modal-lg" target="/scorecards/getHitBreakdown/${element.Scorecard.player_id}/${element.Scorecard.game_id}.json?${params.toString()}">${hitDiff} (${element.Scorecard.shot_opponent}/${element.Scorecard.times_zapped}) <i class="material-icons">bar_chart</i></a>`;
                        let positionElement =
                            `<span class="${positionClass}">${element.Scorecard.position}</span>`;

                        return {
                            player_name: element.Scorecard.player_name,
                            player_link: playerLink,
                            game_name: element.Game.game_name,
                            game_link: gameLink,
                            position: element.Scorecard.position,
                            position_element: positionElement,
                            score: element.Scorecard.score,
                            mvp_points: mvp,
                            mvp_points_link: mvpLink,
                            accuracy: (Math.round(element.Scorecard.accuracy * 100 * 100) /
                                100),
                            hit_diff: hitDiff,
                            hit_diff_link: hitDiffLink,
                            medic_hits: element.Scorecard.medic_hits,
                            shot_team: element.Scorecard.shot_team
                        };
                    });
                    return result;
                }
            },
            columns: [{
                    defaultContent: '',
                    orderable: false,
                    responsivePriority: 1
                },
                {
                    data: null,
                    render: {
                        _: "player_name",
                        display: "player_link"
                    },
                    responsivePriority: 2
                },
                {
                    data: null,
                    render: {
                        _: "game_name",
                        display: "game_link"
                    }
                },
                {
                    data: null,
                    render: {
                        _: "position",
                        display: "position_element"
                    },
                    responsivePriority: 3
                },
                {
                    data: "score",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: null,
                    render: {
                        _: "mvp_points",
                        display: "mvp_points_link"
                    },
                    className: "text-right",
                    responsivePriority: 4
                },
                {
                    data: null,
                    render: {
                        _: "hit_diff",
                        display: "hit_diff_link"
                    },
                    className: "text-right"
                },
                {
                    data: "medic_hits",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "accuracy",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "shot_team",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
            ],
            order: [
                [5, "desc"]
            ]
        });

        overall.on('order.dt', function() {
            overall.column(0, {
                order: 'applied'
            }).nodes().each(function(cell, i) {
                cell.innerHTML = i + 1;
            });
        }).draw();

        var summary_stats = $('#summary_stats').DataTable({
            orderCellsTop: true,
            scrollX: true,
            fixedColumns: {
                leftColumns: 2
            },
            ajax: {
                url: `/scorecards/nightlySummaryStats.json?${params.toString()}`
            },
            columns: [{
                    defaultContent: '',
                    orderable: false
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/players/view/${row.player_id}?${params.toString()}">${row.player_name}</a>`;
                        }
                        return row.player_name;
                    }
                },
                {
                    data: "min_score",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "avg_score",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "max_score",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return Number.parseFloat(row.min_mvp).toFixed(2);
                        } else {
                            return row.min_mvp;
                        }
                    },
                    className: "text-right",
                    orderSequence: ["desc", "asc"],
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            avg_mvp = Math.round(row.avg_mvp * 100) / 100;
                            overall_avg_mvp = Math.round(row.overall_avg_mvp * 100) / 100;

                            if (row.overall_avg_mvp >= row.avg_mvp) {
                                return `${avg_mvp}<i class="material-icons text-danger" title="${overall_avg_mvp}">arrow_downward</i>`
                            } else if(row.overall_avg_mvp === row.avg_mvp) {
                                return `${avg_mvp}<i class="material-icons" title="${overall_avg_mvp}">remove</i>`
                            } else {
                                return `${avg_mvp}<i class="material-icons text-success" title="${overall_avg_mvp}">arrow_upward</i>`
                            }
                        }

                        return row.avg_mvp;
                    },
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return Number.parseFloat(row.max_mvp).toFixed(2);
                        } else {
                            return row.max_mvp;
                        }
                    },
                    className: "text-right",
                    orderSequence: ["desc", "asc"],
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            avg_acc = Math.round(row.avg_acc * 100 * 100) / 100;
                            overall_avg_acc = Math.round(row.overall_avg_acc * 100) / 100;

                            if (row.overall_avg_acc >= row.avg_acc) {
                                return `${avg_acc}%<i class="material-icons text-danger" title="${overall_avg_acc}">arrow_downward</i>`
                            } else {
                                return `${avg_acc}%<i class="material-icons text-success" title="${overall_avg_acc}">arrow_upward</i>`
                            }
                        }

                        return row.avg_acc;
                    },
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            hit_diff = Math.round(row.hit_diff * 100) / 100;

                            return hit_diff;
                        }

                        return row.hit_diff;
                    },
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "medic_hits",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        var rate = row.elim_rate;
                        if (type === 'display') {
                            return rate + '%';
                        }

                        return rate;
                    },
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        var ratio = Math.round((row.games_won / row.games_played) * 100);
                        if (type === 'display') {
                            return ratio + '% (' + row.games_won + '/' + row.games_played + ')';
                        }

                        return ratio;
                    },
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                }
            ],
            "order": [
                [6, "desc"]
            ]
        });

        summary_stats.on('order.dt', function() {
            summary_stats.column(0, {
                order: 'applied'
            }).nodes().each(function(cell, i) {
                cell.innerHTML = i + 1;
            });
        }).draw();

        var medicHitsTable = $('#medic_hits').DataTable({
            orderCellsTop: true,
            scrollX: true,
            fixedColumns: {
                leftColumns: 2
            },
            ajax: {
                url: `/scorecards/nightlyMedicHits.json?${params.toString()}`
            },
            columns: [{
                    defaultContent: '',
                    orderable: false
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/players/view/${row.player_id}?${params.toString()}">${row.player_name}</a>`;
                        }
                        return row.player_name;
                    }
                },
                {
                    data: "total_medic_hits",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return Math.round(row.medic_hits_per_game * 100) / 100;
                        }

                        return row.medic_hits_per_game;
                    },
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "games_played",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "non_resup_total_medic_hits",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return Math.round(row.non_resup_medic_hits_per_game * 100) / 100;
                        }

                        return row.non_resup_medic_hits_per_game;
                    },
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "non_resup_games_played",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                }
            ],
            "order": [
                [2, "desc"]
            ]
        });

        medicHitsTable.on('order.dt', function() {
            medicHitsTable.column(0, {
                order: 'applied'
            }).nodes().each(function(cell, i) {
                cell.innerHTML = i + 1;
            });
        }).draw();

        $('#nightlySelectDate').change(function() {
            const params = new URLSearchParams(location.search);
            params.set('date', $(this).val());
            window.location = `${location.pathname}?${params.toString()}`;
        });
    });
</script>