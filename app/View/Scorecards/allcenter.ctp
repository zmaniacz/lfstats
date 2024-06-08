<?= $this->element('breadcrumbs'); ?>
<hr>
<h4 class="my-4">
    All-Center Teams
</h4>
<div class="row">
    <div class="col-sm-6">
        <label for="min_games_range">Min Games: <span id="min_games_slider_value"></span></label>
        <input type="range" class="form-range" id="min_games_range" min="0" max="100" value="15" />
    </div>
    <div class="col-sm-6">
        Timeframe:<br /><br />
        <select class="form-select" id="min_days_select">
            <option value="0">All Time</option>
            <option value="365" selected>Last 12 Months</option>
            <option value="120">Last 120 Days</option>
            <option value="90">Last 90 Days</option>
        </select>
    </div>
</div>
<div class="row mt-4">
    <div class="col-sm-6">
        <h3><span class="label label-success">1st Team</span></h3>
        <table class="allcenter table table-bordered table-hover table-sm" id="all_center_a">
            <thead>
                <th>Position</th>
                <th>Player</th>
                <th>Average MVP</th>
            </thead>
        </table>
    </div>
    <div class="col-sm-6">
        <h3><span class="label label-danger">2nd Team</span></h3>
        <table class="allcenter table table-bordered table-hover table-sm" id="all_center_b">
            <thead>
                <th>Position</th>
                <th>Player</th>
                <th>Average MVP</th>
            </thead>
        </table>
    </div>
</div>
<script type="text/javascript">
    $(document).ready(function() {
        const params = new URLSearchParams(location.search);
        var min_games = 15;
        var min_days = 365;
        var min_games_slider = document.getElementById("min_games_slider")

        let slider = $('#min_games_range');
        slider.val(min_games);
        $("#min_games_slider_value").text(slider.val())

        slider.on('input', function(event) {
            $("#min_games_slider_value").text(slider.val())
        });

        slider.on('change', function(event) {
            min_games = slider.val();
            updateAllCenter(min_games, min_days);
        });

        $('.allcenter').DataTable({
            searching: false,
            info: false,
            paging: false,
            ordering: false,
            columns: [{
                    data: "position"
                },
                {
                    data: function(row, type, val, meta) {
                        return '<a href="/players/view/' + row.player_id + '?' + params
                            .toString() + '">' + row.player_name + '</a>';
                    },
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return row.avg_mvp.toFixed(2);
                        }
                        return row.avg_mvp;
                    }
                }
            ]
        });

        function updateAllCenter(min_games, min_days) {
            params.set('min_games', min_games);
            params.set('min_days', min_days);

            $.ajax({
                "url": "/scorecards/getAllCenter.json?" + params.toString()
            }).done(function(response) {
                $('#all_center_a').DataTable().clear().rows.add(response.all_center.team_a).draw();
                $('#all_center_b').DataTable().clear().rows.add(response.all_center.team_b).draw();
            })
        }

        updateAllCenter(min_games, min_days);

        $("#min_days_select").change(function() {
            min_days = this.value;
            updateAllCenter(min_games, min_days);
        });
    });
</script>