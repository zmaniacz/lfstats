<?php
echo $this->Html->script('https://unpkg.com/gijgo@1.9.13/js/gijgo.min.js', ['inline' => false]);
echo $this->Html->css('https://unpkg.com/gijgo@1.9.13/css/gijgo.min.css', ['inline' => false]);
echo $this->element('breadcrumbs');
?>
<hr>
<div class="card my-0">
    <div class="card-body">
        <?php if ($this->Session->read('state.isComp') > 0) { ?>
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" id="rounds_cbox">
                <label class="form-check-label" for="rounds_cbox">Show Rounds</label>
            </div>
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" id="finals_cbox">
                <label class="form-check-label" for="finals_cbox">Show Finals</label>
            </div>
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" id="subs_cbox">
                <label class="form-check-label" for="subs_cbox">Show Subs</label>
            </div>
        <?php } ?>
        <div class="col-xs-6">
            <label for="min_games_range">Min Games: <span id="min_games_slider_value"></span></label>
            <input type="range" class="form-range" id="min_games_range" min="0" max="100" />
        </div>
        <?php if ($this->Session->read('state.isComp') <= 0) { ?>
            <div class="row justify-content-center">
                <div class="col-lg-3 col-sm-6">
                    <label for="startDate">Start</label>
                    <input id="startDate" class="form-control" type="date" />
                    <span id="startDateSelected"></span>
                </div>
                <div class="col-lg-3 col-sm-6">
                    <label for="endDate">End</label>
                    <input id="endDate" class="form-control" type="date" />
                    <span id="endDateSelected"></span>
                </div>
                <button id="applyDateButton" type="button" class="btn btn-sm btn-info mx-1">Apply</button>
                <button id="resetDateButton" type="button" class="btn btn-sm btn-warning mx-1">Reset</button>
            </div>
        <?php } ?>
    </div>
</div>
<h4 class="my-4">
    Average Averages
</h4>
<table class="table table-bordered table-hover table-sm nowrap" style="width:100%" id="overall_averages_table">
    <thead>
        <tr>
            <th rowspan="2">Name</th>
            <th colspan="6">Overall</th>
            <th colspan="3">Commander</th>
            <th colspan="3">Heavy Weapons</th>
            <th colspan="3">Scout</th>
            <th colspan="3">Ammo Carrier</th>
            <th colspan="3">Medic</th>
        </tr>
        <tr>
            <th>Avg MVP</th>
            <th>MVP/m</th>
            <th>Total MVP</th>
            <th>Accuracy</th>
            <th>Hit Diff</th>
            <th>Win Rate</th>
            <th>MVP</th>
            <th>Accuracy</th>
            <th>Win Rate</th>
            <th>MVP</th>
            <th>Accuracy</th>
            <th>Win Rate</th>
            <th>MVP</th>
            <th>Accuracy</th>
            <th>Win Rate</th>
            <th>MVP</th>
            <th>Accuracy</th>
            <th>Win Rate</th>
            <th>MVP</th>
            <th>Accuracy</th>
            <th>Win Rate</th>
        </tr>
    </thead>
</table>
<h4 class="my-4">
    Commander
</h4>
<table class="table table-bordered table-hover table-sm nowrap" id="commander_overall_table">
    <thead>
        <tr>
            <th>Name</th>
            <th>Win Rate</th>
            <th>Average Score</th>
            <th>Total Score</th>
            <th>Average MVP</th>
            <th>Total MVP</th>
            <th class="accuracy">Average Accuracy</th>
            <th>Nuke Success Ratio</th>
            <th>Hit Differential</th>
            <th>Average Missiles</th>
            <th>Average Medic Hits</th>
        </tr>
    </thead>
</table>
<h4 class="my-4">
    Heavy Weapons
</h4>
<table class="table table-bordered table-hover table-sm nowrap" id="heavy_overall_table">
    <thead>
        <tr>
            <th>Name</th>
            <th>Win Rate</th>
            <th>Average Score</th>
            <th>Total Score</th>
            <th>Average MVP</th>
            <th>Total MVP</th>
            <th class="accuracy">Average Accuracy</th>
            <th>Hit Differential</th>
            <th>Average Missiles</th>
            <th>Average Medic Hits</th>
        </tr>
    </thead>
</table>
<h4 class="my-4">
    Scout
</h4>
<table class="table table-bordered table-hover table-sm nowrap" id="scout_overall_table">
    <thead>
        <tr>
            <th>Name</th>
            <th>Win Rate</th>
            <th>Average Score</th>
            <th>Total Score</th>
            <th>Average MVP</th>
            <th>Total MVP</th>
            <th class="accuracy">Average Accuracy</th>
            <th>Hit Differential</th>
            <th>Average 3Hit Hits</th>
            <th>Average Medic Hits</th>
            <th>Average Rapid Fire</th>
        </tr>
    </thead>
</table>
<h4 class="my-4">
    Ammo Carrier
</h4>
<table class="table table-bordered table-hover table-sm nowrap" id="ammo_overall_table">
    <thead>
        <tr>
            <th>Name</th>
            <th>Win Rate</th>
            <th>Average Score</th>
            <th>Total Score</th>
            <th>Average MVP</th>
            <th>Total MVP</th>
            <th class="accuracy">Average Accuracy</th>
            <th>Hit Differential</th>
            <th>Average Boosts</th>
            <th>Average Resupplies</th>
        </tr>
    </thead>
</table>
<h4 class="my-4">
    Medic
</h4>
<table class="table table-bordered table-hover table-sm nowrap" id="medic_overall_table">
    <thead>
        <tr>
            <th>Name</th>
            <th>Win Rate</th>
            <th>Average Score</th>
            <th>Total Score</th>
            <th>Average MVP</th>
            <th>Total MVP</th>
            <th class="accuracy">Average Accuracy</th>
            <th>Hit Differential</th>
            <th>Average Boosts</th>
            <th>Average Resupplies</th>
            <th>Average Lives Left</th>
            <th class="team_elim">Team Elimination Rate</th>
        </tr>
    </thead>
</table>
<h4 class="my-4">
    Medic Hits
</h4>
<table class="table table-bordered table-hover table-sm nowrap" id="overall_medic_hits_table">
    <thead>
        <tr>
            <th>Name</th>
            <th>Total Medic Hits (All)</th>
            <th>Average Medic Hits (All)</th>
            <th>Games Played (All)</th>
            <th>Total Medic Hits (Non-Resupply)</th>
            <th>Average Medic Hits (Non-Resupply)</th>
            <th>Games Played (Non-Resupply)</th>
        </tr>
    </thead>
</table>
<script type="text/javascript">
    $(document).ready(function() {
        let params = new URLSearchParams(location.search);
        let min = <?php echo ($this->Session->read('state.isComp') > 0) ? 1 : 25; ?>;

        if (!params.has('show_rounds'))
            params.set('show_rounds', 'true');

        if (!params.has('show_finals'))
            params.set('show_finals', 'false');

        if (!params.has('show_subs'))
            params.set('show_subs', 'false');

        if (params.get('show_rounds') === 'true')
            $('#rounds_cbox').attr("checked", "checked")
        if (params.get('show_finals') === 'true')
            $('#finals_cbox').attr("checked", "checked")
        if (params.get('show_subs') === 'true')
            $('#subs_cbox').attr("checked", "checked")

        function updateFilter(type) {
            if ($(`#${type}_cbox`).is(':checked')) {
                params.set(`show_${type}`, 'true');
            } else {
                params.set(`show_${type}`, 'false');
            }

            window.location = `/scorecards/overall?${params.toString()}`;
        }
        $('#subs_cbox').change(function() {
            updateFilter('subs');
        });
        $('#rounds_cbox').change(function() {
            updateFilter('rounds');
        });
        $('#finals_cbox').change(function() {
            updateFilter('finals');
        });

        var overall_data
        var overall_table = $('#overall_averages_table').DataTable({
            deferRender: true,
            scrollX: true,
            fixedColumns: true,
            buttons: [{
                extend: 'csvHtml5',
                className: 'btn btn-info btn-sm',
                text: 'Download CSV'
            }],
            order: [
                [1, "desc"]
            ],
            columns: [{
                    data: "player_name_link",
                },
                {
                    data: "avg_avg_mvp"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return Math.round(row.mvp_per_minute * 100) / 100;
                        }
                        return row.mvp_per_minute;
                    }
                },
                {
                    data: "total_mvp"
                },
                {
                    data: "avg_avg_acc"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return '<a href="/Players/view/' + row.player_id + '">' + row.hit_diff + '</a>';
                        }
                        return row.hit_diff;
                    }
                },
                {
                    data: function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.games_played > 0) ratio = Math.round((row.games_won / row.games_played) * 100);
                        if (type === 'display') return ratio + '% (' + row.games_won + '/' + row.games_played + ')';
                        return ratio;
                    }
                },
                {
                    data: "commander_avg_mvp"
                },
                {
                    data: "commander_avg_acc"
                },
                {
                    data: function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.commander_games_played > 0) ratio = Math.round((row.commander_games_won / row.commander_games_played) * 100);
                        if (type === 'display') return ratio + '% (' + row.commander_games_won + '/' + row.commander_games_played + ')';
                        return ratio;
                    }
                },
                {
                    data: "heavy_avg_mvp"
                },
                {
                    data: "heavy_avg_acc"
                },
                {
                    data: function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.heavy_games_played > 0) ratio = Math.round((row.heavy_games_won / row.heavy_games_played) * 100);
                        if (type === 'display') return ratio + '% (' + row.heavy_games_won + '/' + row.heavy_games_played + ')';
                        return ratio;
                    }
                },
                {
                    data: "scout_avg_mvp"
                },
                {
                    data: "scout_avg_acc"
                },
                {
                    data: function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.scout_games_played > 0) ratio = Math.round((row.scout_games_won / row.scout_games_played) * 100);
                        if (type === 'display') return ratio + '% (' + row.scout_games_won + '/' + row.scout_games_played + ')';
                        return ratio;
                    }
                },
                {
                    data: "ammo_avg_mvp"
                },
                {
                    data: "ammo_avg_acc"
                },
                {
                    data: function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.ammo_games_played > 0) ratio = Math.round((row.ammo_games_won / row.ammo_games_played) * 100);
                        if (type === 'display') return ratio + '% (' + row.ammo_games_won + '/' + row.ammo_games_played + ')';
                        return ratio;
                    }
                },
                {
                    data: "medic_avg_mvp"
                },
                {
                    data: "medic_avg_acc"
                },
                {
                    data: function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.medic_games_played > 0) ratio = Math.round((row.medic_games_won / row.medic_games_played) * 100);
                        if (type === 'display') return ratio + '% (' + row.medic_games_won + '/' + row.medic_games_played + ')';
                        return ratio;
                    }
                },
            ]
        })

        overall_table.on('draw.dt', function() {
            overall_table.buttons().container().appendTo('#overall_averages_table_wrapper');
        });

        var commander_overall_data
        var commander_overall_table = $('#commander_overall_table').DataTable({
            deferRender: true,
            scrollX: true,
            fixedColumns: true,
            order: [
                [4, "desc"]
            ],
            columns: [{
                    "data": "player_name_link"
                },
                {
                    "data": function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.games_played > 0) ratio = Math.round((row.games_won / row.games_played) * 100);
                        if (type === 'display') return ratio + '% (' + row.games_won + '/' + row.games_played + ')';
                        return ratio;
                    }
                },
                {
                    "data": "avg_score"
                },
                {
                    "data": "total_score"
                },
                {
                    "data": "avg_mvp"
                },
                {
                    "data": "total_mvp"
                },
                {
                    "data": "avg_acc"
                },
                {
                    "data": "nuke_ratio"
                },
                {
                    "data": "hit_diff"
                },
                {
                    "data": "avg_missiles"
                },
                {
                    "data": "avg_medic_hits"
                }
            ]
        });

        var heavy_overall_data
        var heavy_overall_table = $('#heavy_overall_table').DataTable({
            deferRender: true,
            scrollX: true,
            fixedColumns: true,
            order: [
                [4, "desc"]
            ],
            columns: [{
                    "data": "player_name_link"
                },
                {
                    "data": function(row, type, val, meta) {
                        let ratio = 0;
                        if (row.games_played > 0) ratio = Math.round((row.games_won / row.games_played) * 100);
                        if (type === 'display') {
                            return ratio + '% (' + row.games_won + '/' + row.games_played + ')';
                        }

                        return ratio;
                    }
                },
                {
                    "data": "avg_score"
                },
                {
                    "data": "total_score"
                },
                {
                    "data": "avg_mvp"
                },
                {
                    "data": "total_mvp"
                },
                {
                    "data": "avg_acc"
                },
                {
                    "data": "hit_diff"
                },
                {
                    "data": "avg_missiles"
                },
                {
                    "data": "avg_medic_hits"
                }
            ]
        });

        var scout_overall_data
        var scout_overall_table = $('#scout_overall_table').DataTable({
            "deferRender": true,
            scrollX: true,
            fixedColumns: true,
            "order": [
                [4, "desc"]
            ],
            "columns": [{
                    "data": "player_name_link"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_won / row.games_played) * 100);
                        if (type === 'display') {
                            return ratio + '% (' + row.games_won + '/' + row.games_played + ')';
                        }

                        return ratio;
                    }
                },
                {
                    "data": "avg_score"
                },
                {
                    "data": "total_score"
                },
                {
                    "data": "avg_mvp"
                },
                {
                    "data": "total_mvp"
                },
                {
                    "data": "avg_acc"
                },
                {
                    "data": "hit_diff"
                },
                {
                    "data": "avg_3hit"
                },
                {
                    "data": "avg_medic_hits"
                },
                {
                    "data": "avg_rapid_fire"
                }
            ]
        });

        var ammo_overall_data
        var ammo_overall_table = $('#ammo_overall_table').DataTable({
            "deferRender": true,
            scrollX: true,
            fixedColumns: true,
            "order": [
                [4, "desc"]
            ],
            "columns": [{
                    "data": "player_name_link"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_won / row.games_played) * 100);
                        if (type === 'display') {
                            return ratio + '% (' + row.games_won + '/' + row.games_played + ')';
                        }

                        return ratio;
                    }
                },
                {
                    "data": "avg_score"
                },
                {
                    "data": "total_score"
                },
                {
                    "data": "avg_mvp"
                },
                {
                    "data": "total_mvp"
                },
                {
                    "data": "avg_acc"
                },
                {
                    "data": "hit_diff"
                },
                {
                    "data": "avg_ammo_boost"
                },
                {
                    "data": "avg_resup"
                }
            ]
        });

        var medic_overall_data
        var medic_overall_table = $('#medic_overall_table').DataTable({
            "deferRender": true,
            scrollX: true,
            fixedColumns: true,
            "order": [
                [4, "desc"]
            ],
            "columns": [{
                    "data": "player_name_link"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_won / row.games_played) * 100);
                        if (type === 'display') {
                            return ratio + '% (' + row.games_won + '/' + row.games_played + ')';
                        }

                        return ratio;
                    }
                },
                {
                    "data": "avg_score"
                },
                {
                    "data": "total_score"
                },
                {
                    "data": "avg_mvp"
                },
                {
                    "data": "total_mvp"
                },
                {
                    "data": "avg_acc"
                },
                {
                    "data": "hit_diff"
                },
                {
                    "data": "avg_life_boost"
                },
                {
                    "data": "avg_resup"
                },
                {
                    "data": "avg_lives"
                },
                {
                    "data": "elim_rate"
                }
            ]
        });

        var overall_medic_hits_data
        var overall_medic_hits_table = $('#overall_medic_hits_table').DataTable({
            "deferRender": true,
            scrollX: true,
            fixedColumns: true,
            "order": [
                [1, "desc"]
            ],
            "ajax": {
                "url": `/scorecards/getOverallMedicHits.json?${params.toString()}`
            },
            "columns": [{
                    "data": "player_name_link",
                },
                {
                    "data": "total_medic_hits"
                },
                {
                    "data": "medic_hits_per_game"
                },
                {
                    "data": "games_played"
                },
                {
                    "data": "non_resup_total_medic_hits"
                },
                {
                    "data": "non_resup_medic_hits_per_game"
                },
                {
                    "data": "non_resup_games_played"
                }
            ]
        });

        function update_table(table, filter, data) {
            table.clear()
            table.rows.add(data.filter(function(row) {
                return row.games_played >= filter
            })).draw()
        }

        //AJAX calls to fetch raw datasets for the datatables
        $.when(
            $.ajax({
                url: `/scorecards/getOverallAverages.json?${params.toString()}`
            }).done(function(response) {
                overall_data = response.data
                update_table(overall_table, min, overall_data)
            }),

            $.ajax({
                "url": "<?php echo html_entity_decode($this->Html->url(['controller' => 'scorecards', 'action' => 'getOverallStats', 'commander', 'ext' => 'json'])); ?>"
            }).done(function(response) {
                commander_overall_data = response.data
                update_table(commander_overall_table, min, commander_overall_data)
            }),

            $.ajax({
                "url": "<?php echo html_entity_decode($this->Html->url(['controller' => 'scorecards', 'action' => 'getOverallStats', 'heavy', 'ext' => 'json'])); ?>"
            }).done(function(response) {
                heavy_overall_data = response.data
                update_table(heavy_overall_table, min, heavy_overall_data)
            }),

            $.ajax({
                "url": "<?php echo html_entity_decode($this->Html->url(['controller' => 'scorecards', 'action' => 'getOverallStats', 'scout', 'ext' => 'json'])); ?>"
            }).done(function(response) {
                scout_overall_data = response.data
                update_table(scout_overall_table, min, scout_overall_data)
            }),

            $.ajax({
                "url": "<?php echo html_entity_decode($this->Html->url(['controller' => 'scorecards', 'action' => 'getOverallStats', 'ammo', 'ext' => 'json'])); ?>"
            }).done(function(response) {
                ammo_overall_data = response.data
                update_table(ammo_overall_table, min, ammo_overall_data)
            }),

            $.ajax({
                "url": "<?php echo html_entity_decode($this->Html->url(['controller' => 'scorecards', 'action' => 'getOverallStats', 'medic', 'ext' => 'json'])); ?>"
            }).done(function(response) {
                medic_overall_data = response.data
                update_table(medic_overall_table, min, medic_overall_data)
            }))

        let slider = $('#min_games_range');
        slider.val(min);
        $("#min_games_slider_value").text(slider.val())

        slider.on('input', function(event) {
            $("#min_games_slider_value").text(slider.val())
        });

        slider.on('change', function(event) {
            min = slider.val();
            update_table(overall_table, min, overall_data)
            update_table(commander_overall_table, min, commander_overall_data)
            update_table(heavy_overall_table, min, heavy_overall_data)
            update_table(scout_overall_table, min, scout_overall_data)
            update_table(ammo_overall_table, min, ammo_overall_data)
            update_table(medic_overall_table, min, medic_overall_data)
        });

        if (params.get("startDate")) {
            $('#startDate').val(params.get("startDate"))
        }
        if (params.get("endDate")) {
            $('#endDate').val(params.get("endDate"))
        }

        $('#startDate').on('change', function(event) {
            params.set('startDate', $('#startDate').val());
        })

        $('#endDate').on('change', function(event) {
            params.set('endDate', $('#endDate').val());
        })

        $('#applyDateButton').click(function(event) {
            window.location = `/scorecards/overall?${params.toString()}`;
        })
        $('#resetDateButton').click(function(event) {
            params.delete('startDate');
            params.delete('endDate');
            window.location = `/scorecards/overall?${params.toString()}`;
        })
    });
</script>