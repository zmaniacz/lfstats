<?= $this->element('breadcrumbs'); ?>
<hr>
<div style="position: sticky; top: 56px; z-index: 1">
    <div class="card my-0">
        <div class="card-body">
            <?php if ($this->Session->read('state.isComp') > 0): ?>
            <div class="btn-group-toggle" data-toggle="buttons">
                <label
                    class="btn btn-outline-info<?= (($this->Session->read('state.show_rounds') == 'true') ? " active" : "")?>">
                    <input type="checkbox" id="rounds_cbox"
                        <?= (($this->Session->read('state.show_rounds') == 'true') ? "checked" : "")?>>Show
                    Rounds
                </label>
                <label
                    class="btn btn-outline-info<?= (($this->Session->read('state.show_finals') == 'true') ? " active" : "")?>">
                    <input type="checkbox" id="finals_cbox"
                        <?= (($this->Session->read('state.show_finals') == 'true') ? "checked" : "")?>>Show
                    Finals
                </label>
                <label
                    class="btn btn-outline-info<?= (($this->Session->read('state.show_subs') == 'true') ? " active" : "")?>">
                    <input type="checkbox" id="sub_cbox"
                        <?= (($this->Session->read('state.show_subs') == 'true') ? "checked" : "")?>>Show
                    Subs
                </label>
            </div>
            <?php else: ?>
            <p>Min Games: <span id="min_games_slider_value"></span></p>
            <div class="col-xs-4">
                <div id="min_games_slider"></div>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>
<?php
    $positions = array('commander','heavy','scout','ammo','medic');
?>
<?php foreach ($positions as $position): ?>
<h4 class="my-4 text-capitalize">
    <?= $position; ?>
</h4>
<div class="table-responsive">
    <table class="table table-striped table-bordered table-hover table-sm" id="<?= $position; ?>_allstar_table">
        <thead>
            <tr>
                <th>Name</th>
                <th>Games at Position / Total</th>
                <th>Average MVP Points</th>
            </tr>
        </thead>
    </table>
</div>
<?php endforeach; ?>
<script type="text/javascript">
$(document).ready(function() {
    $('#commander_allstar_table').DataTable({
        "processing": true,
        "order": [
            [2, "desc"]
        ],
        "columns": [{
                "data": "name"
            },
            {
                "data": function(row, type, val, meta) {
                    var ratio = Math.round((row.games_played / row.total_games_played) * 100);
                    if (type === 'display') {
                        return row.games_played + '/' + row.total_games_played;
                    }

                    return ratio;
                }
            },
            {
                "data": "avg_mvp"
            }
        ]
    });

    $('#heavy_allstar_table').DataTable({
        "processing": true,
        "order": [
            [2, "desc"]
        ],
        "columns": [{
                "data": "name"
            },
            {
                "data": function(row, type, val, meta) {
                    var ratio = Math.round((row.games_played / row.total_games_played) * 100);
                    if (type === 'display') {
                        return row.games_played + '/' + row.total_games_played;
                    }

                    return ratio;
                }
            },
            {
                "data": "avg_mvp"
            }
        ]
    });

    $('#scout_allstar_table').DataTable({
        "processing": true,
        "order": [
            [2, "desc"]
        ],
        "columns": [{
                "data": "name"
            },
            {
                "data": function(row, type, val, meta) {
                    var ratio = Math.round((row.games_played / row.total_games_played) * 100);
                    if (type === 'display') {
                        return row.games_played + '/' + row.total_games_played;
                    }

                    return ratio;
                }
            },
            {
                "data": "avg_mvp"
            }
        ]
    });

    $('#ammo_allstar_table').DataTable({
        "processing": true,
        "order": [
            [2, "desc"]
        ],
        "columns": [{
                "data": "name"
            },
            {
                "data": function(row, type, val, meta) {
                    var ratio = Math.round((row.games_played / row.total_games_played) * 100);
                    if (type === 'display') {
                        return row.games_played + '/' + row.total_games_played;
                    }

                    return ratio;
                }
            },
            {
                "data": "avg_mvp"
            }
        ]
    });

    $('#medic_allstar_table').DataTable({
        "processing": true,
        "order": [
            [2, "desc"]
        ],
        "columns": [{
                "data": "name"
            },
            {
                "data": function(row, type, val, meta) {
                    var ratio = Math.round((row.games_played / row.total_games_played) * 100);
                    if (type === 'display') {
                        return row.games_played + '/' + row.total_games_played;
                    }

                    return ratio;
                }
            },
            {
                "data": "avg_mvp"
            }
        ]
    });

    $.ajax({
        "url": "<?= html_entity_decode($this->Html->url(array('controller' => 'scorecards', 'action' => 'getAllStarStats', 'ext' => 'json'))); ?>"
    }).done(function(response) {
        $('#commander_allstar_table').DataTable().clear().rows.add(response.data.commander).draw()
        $('#heavy_allstar_table').DataTable().clear().rows.add(response.data.heavy).draw()
        $('#scout_allstar_table').DataTable().clear().rows.add(response.data.scout).draw()
        $('#ammo_allstar_table').DataTable().clear().rows.add(response.data.ammo).draw()
        $('#medic_allstar_table').DataTable().clear().rows.add(response.data.medic).draw()
    })

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