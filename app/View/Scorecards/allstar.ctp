<?= $this->element('breadcrumbs'); ?>
<hr>
<div style="position: sticky; top: 56px; z-index: 1">
    <div class="card my-0">
        <div class="card-body">
            <?php if ($this->Session->read('state.isComp') > 0) : ?>
                <div class="custom-control custom-switch">
                    <input type="checkbox" class="custom-control-input" id="rounds_cbox" <?= (($this->Session->read('state.show_rounds') == 'true') ? "checked" : "") ?>>
                    <label class="custom-control-label" for="rounds_cbox">Show Rounds</label>
                </div>
                <div class="custom-control custom-switch">
                    <input type="checkbox" class="custom-control-input" id="finals_cbox" <?= (($this->Session->read('state.show_finals') == 'true') ? "checked" : "") ?>>
                    <label class="custom-control-label" for="finals_cbox">Show Finals</label>
                </div>
                <div class="custom-control custom-switch">
                    <input type="checkbox" class="custom-control-input" id="subs_cbox" <?= (($this->Session->read('state.show_subs') == 'true') ? "checked" : "") ?>>
                    <label class="custom-control-label" for="subs_cbox">Show Subs</label>
                </div>
        </div>
    <?php else : ?>
        <p>Min Games: <span id="min_games_slider_value"></span></p>
        <div class="col-xs-4">
            <div id="min_games_slider"></div>
        </div>
    <?php endif; ?>
    </div>
</div>
</div>
<?php
$positions = array('commander', 'heavy', 'scout', 'ammo', 'medic');
?>
<?php foreach ($positions as $position) : ?>
    <h4 class="my-4 text-capitalize">
        <?= $position; ?>
    </h4>
    <div class="table-responsive">
        <table class="table table-bordered table-hover table-sm" id="<?= $position; ?>_allstar_table">
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
        let params = new URLSearchParams(location.search);

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

            window.location = `/scorecards/allstar?${params.toString()}`;
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

        $('#commander_allstar_table').DataTable({
            "order": [
                [2, "desc"]
            ],
            "columns": [{
                    "data": "name"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_played / row.total_games_played) *
                            100);
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
            "order": [
                [2, "desc"]
            ],
            "columns": [{
                    "data": "name"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_played / row.total_games_played) *
                            100);
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
            "order": [
                [2, "desc"]
            ],
            "columns": [{
                    "data": "name"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_played / row.total_games_played) *
                            100);
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
            "order": [
                [2, "desc"]
            ],
            "columns": [{
                    "data": "name"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_played / row.total_games_played) *
                            100);
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
            "order": [
                [2, "desc"]
            ],
            "columns": [{
                    "data": "name"
                },
                {
                    "data": function(row, type, val, meta) {
                        var ratio = Math.round((row.games_played / row.total_games_played) *
                            100);
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
    });
</script>