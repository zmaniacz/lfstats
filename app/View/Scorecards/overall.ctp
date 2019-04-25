<?= $this->element('breadcrumbs'); ?>
<hr>
<div style="position: sticky; top: 56px; z-index: 1">
    <div class="card my-0">
        <div class="card-body">
            <?php if ($this->Session->read('state.isComp') > 0): ?>
            <form class="form-inline">
                <div class="checkbox">
                    <input type="checkbox" id="rounds_cbox"
                        <?= (($this->Session->read('state.show_rounds') == 'true') ? "checked" : "")?>>
                    <label for="rounds_cbox">Show Rounds</label>
                    <input type="checkbox" id="finals_cbox"
                        <?= (($this->Session->read('state.show_finals') == 'true') ? "checked" : "")?>>
                    <label for="finals_cbox">Show Finals</label>
                    <input type="checkbox" id="sub_cbox"
                        <?= (($this->Session->read('state.show_subs') == 'true') ? "checked" : "")?>>
                    <label for="sub_cbox">Show Subs</label>
                </div>
            </form>
            <?php else: ?>
            <p>Min Games: <span id="min_games_slider_value"></span></p>
            <div class="col-xs-4">
                <div id="min_games_slider"></div>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>
<h4 class="my-4">
    Average Averages
</h4>
<table class="table table-striped table-bordered table-hover table-sm nowrap" style="width:100%"
    id="overall_averages_table">
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
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="commander_overall_table">
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
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="heavy_overall_table">
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
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="scout_overall_table">
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
        </tr>
    </thead>
</table>
<h4 class="my-4">
    Ammo Carrier
</h4>
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="ammo_overall_table">
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
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="medic_overall_table">
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
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="overall_medic_hits_table">
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
    var overall_data
    var overall_table = $('#overall_averages_table').DataTable({
        deferRender: true,
        scrollX: true,
        fixedColumns: true,
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
                        let display = Math.round(row.mvp_per_minute * 100) / 100;
                        return display;
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
                        return '<a href="/Players/view/' + row.player_id + '">' +
                            row
                            .hit_diff + '</a>';
                    }
                    return row.hit_diff;
                }
            },
            {
                data: function(row, type, val, meta) {
                    var ratio = Math.round((row.games_won / row.games_played) *
                        100);
                    if (type === 'display') {
                        return ratio + '% (' + row.games_won + '/' + row
                            .games_played + ')';
                    }

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
                    var ratio = Math.round((row.commander_games_won / row
                        .commander_games_played) * 100);
                    if (type === 'display') {
                        return ratio + '% (' + row.commander_games_won + '/' + row
                            .commander_games_played + ')';
                    }

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
                    var ratio = Math.round((row.heavy_games_won / row
                            .heavy_games_played) *
                        100);
                    if (type === 'display') {
                        return ratio + '% (' + row.heavy_games_won + '/' + row
                            .heavy_games_played + ')';
                    }

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
                    var ratio = Math.round((row.scout_games_won / row
                            .scout_games_played) *
                        100);
                    if (type === 'display') {
                        return ratio + '% (' + row.scout_games_won + '/' + row
                            .scout_games_played + ')';
                    }

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
                    var ratio = Math.round((row.ammo_games_won / row
                        .ammo_games_played) * 100);
                    if (type === 'display') {
                        return ratio + '% (' + row.ammo_games_won + '/' + row
                            .ammo_games_played + ')';
                    }

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
                    var ratio = Math.round((row.medic_games_won / row
                            .medic_games_played) *
                        100);
                    if (type === 'display') {
                        return ratio + '% (' + row.medic_games_won + '/' + row
                            .medic_games_played + ')';
                    }

                    return ratio;
                }
            },
        ]
    });



    var commander_overall_data
    var commander_overall_table = $('#commander_overall_table').DataTable({
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
            "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getOverallMedicHits', 'ext' => 'json'))); ?>"
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
        table.fixedColumns().relayout();
    }

    //AJAX calls to fetch raw datasets for the datatables
    $.ajax({
        "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getOverallAverages', 'ext' => 'json'))); ?>"
    }).done(function(response) {
        overall_data = response.data
        update_table(overall_table, min, overall_data)
    })

    $.ajax({
        "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getOverallStats', 'commander', 'ext' => 'json'))); ?>"
    }).done(function(response) {
        commander_overall_data = response.data
        update_table(commander_overall_table, min, commander_overall_data)
    })

    $.ajax({
        "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getOverallStats', 'heavy', 'ext' => 'json'))); ?>"
    }).done(function(response) {
        heavy_overall_data = response.data
        update_table(heavy_overall_table, min, heavy_overall_data)
    })

    $.ajax({
        "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getOverallStats', 'scout', 'ext' => 'json'))); ?>"
    }).done(function(response) {
        scout_overall_data = response.data
        update_table(scout_overall_table, min, scout_overall_data)
    })

    $.ajax({
        "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getOverallStats', 'ammo', 'ext' => 'json'))); ?>"
    }).done(function(response) {
        ammo_overall_data = response.data
        update_table(ammo_overall_table, min, ammo_overall_data)
    })

    $.ajax({
        "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getOverallStats', 'medic', 'ext' => 'json'))); ?>"
    }).done(function(response) {
        medic_overall_data = response.data
        update_table(medic_overall_table, min, medic_overall_data)
    })

    //Init the slider to set the terms for the ajax filtering
    if ($("#min_games_slider").length) {
        var slider = document.getElementById("min_games_slider")

        noUiSlider.create(slider, {
            start: 25,
            connect: [true, false],
            step: 1,
            range: {
                'min': 0,
                'max': 100
            }
        });

        slider.noUiSlider.on('update', function(values, handle, unencoded) {
            min = unencoded
            $("#min_games_slider_value").text(min)
        })

        slider.noUiSlider.on('end', function(values, handle, unencoded) {
            update_table(overall_table, min, overall_data)
            update_table(commander_overall_table, min, commander_overall_data)
            update_table(heavy_overall_table, min, heavy_overall_data)
            update_table(scout_overall_table, min, scout_overall_data)
            update_table(ammo_overall_table, min, ammo_overall_data)
            update_table(medic_overall_table, min, medic_overall_data)
        })
    }

    $('#sub_cbox').change(function() {
        if ($('#sub_cbox').is(':checked')) {
            window.location =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterSub', 'true'))); ?>";
        } else {
            window.location =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterSub', 'false'))); ?>";
        }
    });
    $('#finals_cbox').change(function() {
        if ($('#finals_cbox').is(':checked')) {
            window.location =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterFinals', 'true'))); ?>";
        } else {
            window.location =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterFinals', 'false'))); ?>";
        }
    });
    $('#rounds_cbox').change(function() {
        if ($('#rounds_cbox').is(':checked')) {
            window.location =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterRounds', 'true'))); ?>";
        } else {
            window.location =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'filterRounds', 'false'))); ?>";
        }
    });
});
</script>