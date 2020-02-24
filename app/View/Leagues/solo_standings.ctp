<?php echo $this->element('breadcrumbs'); ?>
<hr>
<h4 class="my-4">
    Player Standings
</h4>
<p>Total MVP is calculated as the total of a player's top 5 games by MVP at each position (10 for Scout) with the
    player's handicap added to each game.</p>
<?php if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) { ?>
<a class="btn btn-success my-2" data-toggle="modal" href="#addPlayerModal">Add Player</a> <a
    href="<?php echo $this->Html->url(['controller' => 'Events', 'action' => 'edit', $selected_league['Event']['id']]); ?>"><i
        class="material-icons">settings</i></a>
<?php } ?>
<div class="table-responsive">
    <table class="table table-striped table-bordered table-hover table-sm nowrap" id="solo_standings">
        <thead>
            <th style="width: 25%">Player</th>
            <th style="width: 10%">Total MVP</th>
            <th style="width: 10%">Handicap</th>
            <th style="width: 15%">Avg MVP</th>
            <th style="width: 15%">Avg Score</th>
            <th style="width: 15%">Games Counted</th>
        </thead>
    </table>
</div>
<hr>
<h4 class="my-4">Scorecards <?php echo $this->Html->link('(details)', ['controller' => 'scorecards', 'action' => 'nightlyDetailed'], ['class' => 'h6 text-muted']); ?>
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
<div class="modal fade" id="addPlayerModal" tabindex="-1" role="dialog">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="addPlayerModalLabel">Select a Player</h4>
                <button type="button" class="close" data-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body">
                Note that only players with a valid IPLID can be added. They may need to play a game first.
                <form id="addPlayerModalForm" method="post">
                    <div class="form-group">
                        <label for="player-name" class="control-label">Player:</label>
                        <select class="form-control" id="player-name" name="player-name">
                            <option value="" disabled selected>Choose a player:</option>
                        </select>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="addPlayerModalSaveBtn">Add</button>
            </div>
        </div>
    </div>
</div>
<div class="modal fade" id="playerHandicapModal" tabindex="-1" role="dialog">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="playerHandicapModalLabel">Edit Handicap</h4>
                <button type="button" class="close" data-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="playerHandicapModalForm" method="post">
                    <div class="form-group">
                        <label for="player-handicap" class="control-label">Handicap:</label>
                        <input type="text" class="form-control" id="player-handicap" name="player-handicap">
                        <input type="hidden" id="event-player-id" name="event-player-id">
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="playerHandicapModalSaveBtn">Save</button>
            </div>
        </div>
    </div>
</div>
<script>
    $(document).ready(function() {
        const params = new URLSearchParams(location.search);

        <?php if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) { ?>
        const loggedIn = true;
        <?php } else { ?>
        const loggedIn = false;
        <?php } ?>

        let soloStandingsTable = $('#solo_standings').DataTable({
            processing: true,
            paging: false,
            info: false,
            searching: false,
            order: [
                [1, "desc"]
            ],
            columns: [{
                    data: function(row, type, val, meta) {
                        let link =
                            `<a href="/players/${row.player_id}?${params.toString()}">${row.player_name}</a>`;
                        if (type === 'display') {
                            return link;
                        } else {
                            return row.player_name;
                        }
                    }
                },
                {
                    data: "all_mvp_total",
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display' && loggedIn) {
                            return `<a class="float-left" data-toggle="modal" data-event-player-id="${row.id}" 
                                    data-player-handicap="${row.handicap}" href="#playerHandicapModal">
                                    <i class="material-icons">edit</i></a>${row.handicap} `;
                        } else {
                            return row.handicap;
                        }
                    },
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {

                            return Number.parseFloat(row.avg_mvp).toFixed(2);
                        } else {

                            return row.avg_mvp;
                        }
                    },
                    className: "text-right"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {

                            return Number.parseFloat(row.avg_score).toFixed(2);
                        } else {

                            return row.avg_score;
                        }
                    },
                    className: "text-right"
                },
                {
                    data: "games_played",
                    className: "text-right"
                },
            ]
        });

        let overall = $('#overall').DataTable({
            orderCellsTop: true,
            scrollX: true,
            fixedColumns: {
                leftColumns: 2
            },
            ajax: {
                url: `/scorecards/eventScorecards/<?php echo $selected_league['Event']['id']; ?>.json`,
                dataSrc: function(response) {
                    return response.data.map(function(element) {
                        let positionClass = (element.Scorecard.team === 'red') ?
                            'text-danger' : 'text-success';
                        let gameClass = (element.Game.winner === 'red') ? 'text-danger' :
                            'text-success';
                        let hitDiff = Math.round(element.Scorecard.shot_opponent / Math.max(
                                element.Scorecard.times_zapped, 1) *
                            100) / 100;

                        let playerLink =
                            `<a href="/players/view/${element.Scorecard.player_id}?${params.toString()}">${element.Scorecard.player_name}</a>`;
                        let gameLink =
                            `<a href="/games/view/${element.Game.id}?${params.toString()}" class="${gameClass}">${element.Game.game_name}</a>`;
                        let mvpLink =
                            `<a href="#" data-toggle="modal" data-target="#genericModal" data-title="MVP Details" data-modalsize="modal-sm" target="/scorecards/getMVPBreakdown/${element.Scorecard.id}.json?${params.toString()}">${element.Scorecard.mvp_points} <i class="material-icons">bar_chart</i></a>`;
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
                            mvp_points: element.Scorecard.mvp_points,
                            mvp_points_link: mvpLink,
                            accuracy: (Math.round(element.Scorecard.accuracy * 100 * 100) /
                                100),
                            hit_diff: hitDiff,
                            hit_diff_link: hitDiffLink,
                            medic_hits: element.Scorecard.medic_hits,
                            shot_team: element.Scorecard.shot_team
                        };
                    });
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

        $('#addPlayerModal').on('show.bs.modal', function(event) {
            let modal = $(this)
            $.get(
                    '/leagues/eligiblePlayers/<?php echo $selected_league['Event']['id']; ?>.json'
                )
                .done(function(data) {
                    $.each(data.players, function(key, value) {
                        modal.find('#player-name').append($('<option>', {
                            value: value.Player.id
                        }).text(value.Player.player_name))
                    })
                });

        });

        $('#addPlayerModalSaveBtn').click(function() {
            $.post('/leagues/addPlayer/<?php echo $selected_league['Event']['id']; ?>.json',
                    $('#addPlayerModalForm').serialize())
                .done(function(data) {
                    toastr.success('Added Player');
                    updateSoloStandings(soloStandingsTable);
                })
                .fail(function() {
                    toastr.error('Failed Adding Player');
                    updateSoloStandings(soloStandingsTable);
                })

            $('#addPlayerModal').modal('hide');
        });

        $('#playerHandicapModal').on('show.bs.modal', function(event) {
            let button = $(event.relatedTarget)
            let eventPlayerId = button.data('event-player-id')
            let playerHandicap = button.data('player-handicap')
            let modal = $(this)
            modal.find('#player-handicap').val(playerHandicap)
            modal.find('#event-player-id').val(eventPlayerId)
        });

        $('#playerHandicapModalSaveBtn').click(function() {
            $.post('/leagues/setHandicap', $('#playerHandicapModalForm').serialize())
                .done(function(data) {
                    toastr.success('Handicap saved');
                    updateSoloStandings(soloStandingsTable);
                });

            $('#playerHandicapModal').modal('hide');
        });

        function updateSoloStandings(table) {
            table.ajax.url(
                '/leagues/getSoloStandings/<?php echo $selected_league['Event']['id']; ?>.json'
            ).load();
        }

        updateSoloStandings(soloStandingsTable);
    });
</script>