<?php echo $this->element('breadcrumbs'); ?>
<hr>
<?php if ('league' == $this->Session->read('state.gametype')) { ?>
    <button type="button" class="btn btn-outline-primary" data-bs-toggle="button" id="show_finals_button">
        Show Finals
    </button>
    <button type="button" class="btn btn-outline-primary" data-bs-toggle="button" id="show_subs_button">
        Show Mercs
    </button>
<?php } ?>
<h4 class="my-4">
    Positions
</h4>
<div class="row">
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="commander_scores_table">
            <caption>Commander</caption>
            <thead>
                <th>Name</th>
                <th>Score</th>
                <th>MVP</th>
        </table>
    </div>
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="heavy_scores_table">
            <caption>Heavy Weapons</caption>
            <thead>
                <th>Name</th>
                <th>Score</th>
                <th>MVP</th>
            </thead>
        </table>
    </div>
</div>
<div class="row">
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="scout_scores_table">
            <caption>Scout</caption>
            <thead>
                <th>Name</th>
                <th>Score</th>
                <th>MVP</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="ammo_scores_table">
            <caption>Ammo Carrier</caption>
            <thead>
                <th>Name</th>
                <th>Score</th>
                <th>MVP</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="medic_scores_table">
            <caption>Medic</caption>
            <thead>
                <th>Name</th>
                <th>Score</th>
                <th>MVP</th>
            </thead>
        </table>
    </div>
</div>
<h4 class="my-4">
    Games and Points
</h4>
<div class="row">
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="games_played_leader_table">
            <thead>
                <th>Name</th>
                <th>Total Games</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="score_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Total Score</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="time_played_table">
            <thead>
                <th>Name</th>
                <th>Time Played</th>
            </thead>
        </table>
    </div>
</div>
<h4 class="my-4">
    Medic Tomfoolery
</h4>
<div class="row">
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="medic_hits_leader_table">
            <thead>
                <th>Name</th>
                <th>Total Medic Hits</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="own_medic_hits_leader_table">
            <thead>
                <th>Name</th>
                <th>Own Medic Hits</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="medic_on_medic_hits_leader_table">
            <thead>
                <th>Name</th>
                <th>Medic On Medic Hits</th>
            </thead>
        </table>
    </div>
</div>
<h4 class="my-4">
    Missile Malarkey
</h4>
<div class="row">
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="missiled_opponent_leader_table">
            <thead>
                <th>Name</th>
                <th>Total Missiles</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-6">
        <form>
            <div class="form-group">
                <label for="avg_missiles_min_games_range">Minimum Games: <span id="avg_missiles_min_games">25</span></label>
                <input type="range" class="form-control-range" value="25" min="0" max="100" id="avg_missiles_min_games_range">
            </div>
        </form>
        <table class="table table-bordered table-hover table-sm nowrap" id="avg_missiles_table">
            <thead>
                <th>Name</th>
                <th>Average Missiles as 3-Hit</th>
            </thead>
        </table>
    </div>
</div>
<div class="row">
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="times_missiled_leader_table">
            <thead>
                <th>Name</th>
                <th>Total Times Missiled</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="missiled_team_leader_table">
            <thead>
                <th>Name</th>
                <th>Team Missiles (You Idiot)</th>
            </thead>
        </table>
    </div>
</div>
<h4 class="my-4">
    Nuke Nonsense
</h4>
<div class="row">
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="nukes_detonated_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Total Nukes Detonated</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="nukes_canceled_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Total Nukes Canceled</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-4">
        <table class="table table-bordered table-hover table-sm nowrap" id="own_nuke_cancels_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Own Nukes Canceled</th>
            </thead>
        </table>
    </div>
</div>
<h4 class="my-4">
    Elimination Frustration
</h4>
<div class="row">
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="elim_other_team_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Eliminated Opposing Team</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="team_elim_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Own Team Eliminated</th>
            </thead>
        </table>
    </div>
</div>
<h4 class="my-4">
    Streaky
</h4>
<div class="row">
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="current_win_streak_table">
            <thead>
                <th>Name</th>
                <th>Current Win Streak</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="current_loss_streak_table">
            <thead>
                <th>Name</th>
                <th>Current Losing Streak</th>
            </thead>
        </table>
    </div>
</div>
<div class="row">
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="longest_win_streak_table">
            <thead>
                <th>Name</th>
                <th>Longest Win Streak</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="longest_loss_streak_table">
            <thead>
                <th>Name</th>
                <th>Longest Losing Streak</th>
            </thead>
        </table>
    </div>
</div>
<h4 class="my-4">
    Miscellaneous Mischief
</h4>
<div class="row">
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="shots_fired_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Shots Fired</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-6">
        <table class="table table-bordered table-hover table-sm nowrap" id="penalties_total_leader_table">
            <thead>
                <th>Name</th>
                <th>Penalties</th>
            </thead>
        </table>
    </div>
</div>
<script type="text/javascript">
    function update_table(table, filter, data) {
        table.clear()
        table.rows.add(data.filter(function(row) {
            return row.Scorecard.games_played >= filter
        })).draw()
    }

    function millisToMinutesAndSeconds(millis) {
        let minutes = Math.floor(millis / 60000);
        let seconds = ((millis % 60000) / 1000).toFixed(0);
        return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
    }

    $(document).ready(function() {
        const params = new URLSearchParams(location.search);

        if (!params.has('show_finals'))
            params.set('show_finals', 'false');

        if (!params.has('show_subs'))
            params.set('show_subs', 'false');

        //set initial state on the filter buttons
        if (params.get('show_finals') === 'true')
            $('#show_finals_button').addClass('active');

        if (params.get('show_subs') === 'true')
            $('#show_subs_button').addClass('active');

        //defaults for all tables on this page
        Object.assign(DataTable.defaults, {
            order: [
                [1, "desc"]
            ],
            searching: false,
            lengthChange: false,
            pageLength: 5,
            pagingType: "simple",

        });

        //handle filtering clicks
        $('#show_finals_button').click(function() {
            params.set('show_finals', (params.get('show_finals') === 'true' ? 'false' : 'true'));
            window.location = `${location.pathname}?${params.toString()}`;
        });

        $('#show_subs_button').click(function() {
            params.set('show_subs', (params.get('show_subs') === 'true' ? 'false' : 'true'));
            window.location = `${location.pathname}?${params.toString()}`;
        });

        //handle the missiles slider jfc
        $('#avg_missiles_min_games_range').on('input', function() {
            $('#avg_missiles_min_games').text(this.value);
        });

        $('#avg_missiles_min_games_range').change(function() {
            update_table(avg_missiles_table, parseInt($('#avg_missiles_min_games').text()),
                avg_missiles_data);
        });

        //instantiate all the datatables
        $("table[id$='_leader_table']").DataTable({
            columns: [{
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/players/view/${row.player.id}?${params.toString()}">${row.player.player_name}</a>`;
                        }
                        return row.player.player_name;
                    }
                },
                {
                    "data": "value"
                },
            ]
        });

        $("#time_played_table").DataTable({
            columns: [{
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/players/view/${row.player.id}?${params.toString()}">${row.player.player_name}</a>`;
                        }
                        return row.player.player_name;
                    }
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return millisToMinutesAndSeconds(row.value);
                        }
                        return row.value;
                    }
                },
            ]
        });

        $("table[id$='_scores_table']").DataTable({
            columns: [{
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/players/view/${row.Player.id}?${params.toString()}">${row.Player.player_name}</a>`;
                        }
                        return row.Player.player_name;
                    }
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/games/view/${row.Scorecard.game_id}?${params.toString()}">${row.Scorecard.final_score}</a>`;
                        }
                        return row.Scorecard.final_score;
                    }
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/games/view/${row.Scorecard.game_id}?${params.toString()}">${row.Scorecard.mvp_points.toFixed(2)}</a>`;
                        }
                        return row.Scorecard.mvp_points;
                    }
                }
            ]
        });

        var avg_missiles_data
        var avg_missiles_table = $("#avg_missiles_table").DataTable({
            columns: [{
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return `<a href="/players/view/${row.Player.id}?${params.toString()}">${row.Player.player_name}</a>`;
                        }
                        return row.Player.player_name;
                    }
                },
                {
                    data: function(row, type, val, meta) {
                        let avg = (row.Scorecard.missiled_opponent_total + row.Scorecard
                            .missiled_team_total) / row.Scorecard.games_played;

                        if (type === 'display') {
                            return avg.toFixed(2);
                        }

                        return avg;
                    }
                },
            ]
        });

        $("table[id$='_streak_table']").DataTable({
            columns: [{
                    "data": "player_name"
                },
                {
                    "data": "maxstreak"
                },
            ]
        });

        $.ajax({
            url: "<?php echo html_entity_decode($this->Html->url(['controller' => 'Scorecards', 'action' => 'getPositionLeaderboards', 'ext' => 'json'])); ?>"
        }).done(function(response) {
            $('#commander_scores_table').DataTable().clear().rows.add(response.data.commander).draw();
            $('#heavy_scores_table').DataTable().clear().rows.add(response.data.heavy).draw();
            $('#scout_scores_table').DataTable().clear().rows.add(response.data.scout).draw();
            $('#ammo_scores_table').DataTable().clear().rows.add(response.data.ammo).draw();
            $('#medic_scores_table').DataTable().clear().rows.add(response.data.medic).draw();
        })

        $.ajax({
            url: "<?php echo html_entity_decode($this->Html->url(['controller' => 'Scorecards', 'action' => 'getLeaderboards', 'ext' => 'json'])); ?>"
        }).done(function(response) {
            $('#games_played_leader_table').DataTable().clear().rows.add(response.data.games_played)
                .draw();
            $('#score_total_leader_table').DataTable().clear().rows.add(response.data.score_total)
                .draw();
            $('#time_played_table').DataTable().clear().rows.add(response.data.time_played_total)
                .draw();

            $('#medic_hits_leader_table').DataTable().clear().rows.add(response.data.medic_hits_total)
                .draw();
            $('#own_medic_hits_leader_table').DataTable().clear().rows.add(response.data
                .own_medic_hits_total).draw();
            $('#medic_on_medic_hits_leader_table').DataTable().clear().rows.add(response.data
                .medic_on_medic_hits_total).draw();

            $('#missiled_opponent_leader_table').DataTable().clear().rows.add(response.data
                .missiled_opponent_total).draw();
            $('#times_missiled_leader_table').DataTable().clear().rows.add(response.data
                .times_missiled_total).draw();
            $('#missiled_team_leader_table').DataTable().clear().rows.add(response.data
                .missiled_team_total).draw();

            $('#nukes_detonated_total_leader_table').DataTable().clear().rows.add(response.data
                .nukes_detonated_total).draw();
            $('#nukes_canceled_total_leader_table').DataTable().clear().rows.add(response.data
                .nukes_canceled_total).draw();
            $('#own_nuke_cancels_total_leader_table').DataTable().clear().rows.add(response.data
                .own_nuke_cancels_total).draw();

            $('#elim_other_team_total_leader_table').DataTable().clear().rows.add(response.data
                .elim_other_team_total).draw();
            $('#team_elim_total_leader_table').DataTable().clear().rows.add(response.data
                    .team_elim_total)
                .draw();

            $('#shots_fired_total_leader_table').DataTable().clear().rows.add(response.data
                .shots_fired_total).draw();
            $('#penalties_total_leader_table').DataTable().clear().rows.add(response.data
                    .penalties_total)
                .draw();
        })

        $.ajax({
            url: "<?php echo html_entity_decode($this->Html->url(['controller' => 'Scorecards', 'action' => 'getMissileLeaderboards', 'ext' => 'json'])); ?>"
        }).done(function(response) {
            avg_missiles_data = response.data;
            update_table(avg_missiles_table, parseInt($('#avg_missiles_min_games').text()),
                avg_missiles_data);
        })

        $.ajax({
            url: "<?php echo html_entity_decode($this->Html->url(['controller' => 'Scorecards', 'action' => 'getStreaks', 'max', 'ext' => 'json'])); ?>"
        }).done(function(response) {
            $('#longest_win_streak_table').DataTable().clear().rows.add(response.data.win).draw();
            $('#longest_loss_streak_table').DataTable().clear().rows.add(response.data.loss).draw();
        })

        $.ajax({
            url: "<?php echo html_entity_decode($this->Html->url(['controller' => 'Scorecards', 'action' => 'getStreaks', 'current', 'ext' => 'json'])); ?>"
        }).done(function(response) {
            $('#current_win_streak_table').DataTable().clear().rows.add(response.data.win)
                .draw();
            $('#current_loss_streak_table').DataTable().clear().rows.add(response.data.loss)
                .draw();
        })
    });
</script>