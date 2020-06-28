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
<h4 class="my-4">Overall</h4>
<div>
    <table class="table table-striped table-bordered table-hover table-sm nowrap" style="width:100%" id="overall">
    </table>
</div>
<script type="text/javascript">
    $(document).ready(function() {
        const params = new URLSearchParams(location.search);
        params.set('date', '<?php echo $current_date; ?>');

        var overall = $('#overall').DataTable({
            deferRender: true,
            scrollX: true,
            fixedColumns: {
                leftColumns: 2
            },
            buttons: [{
                extend: 'csvHtml5',
                className: 'btn btn-info btn-sm',
                text: 'Download CSV'
            }],
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

                        let playerLink =
                            `<a href="/players/view/${element.Scorecard.player_id}?${params.toString()}">${element.Scorecard.player_name}</a>`;
                        let gameLink =
                            `<a href="/games/view/${element.Game.id}?${params.toString()}" class="${gameClass}">${element.Game.game_name}</a>`;
                        let mvpLink =
                            `<a href="#" data-toggle="modal" data-target="#genericModal" data-title="MVP Details" data-modalsize="modal-sm" target="/scorecards/getMVPBreakdown/${element.Scorecard.id}.json?${params.toString()}">${Number.parseFloat(element.Scorecard.mvp_points).toFixed(2)} <i class="material-icons">bar_chart</i></a>`;
                        let hitDiffLink =
                            `<a href="#" data-toggle="modal" data-target="#genericModal" data-title="Hit Details" data-modalsize="modal-lg" target="/scorecards/getHitBreakdown/${element.Scorecard.player_id}/${element.Scorecard.game_id}.json?${params.toString()}">${hitDiff} (${element.Scorecard.shot_opponent}/${element.Scorecard.times_zapped}) <i class="material-icons">bar_chart</i></a>`;
                        let positionElement =
                            `<span class="${positionClass}">${element.Scorecard.position}</span>`;

                        return {
                            player_link: playerLink,
                            game_name: element.Game.game_name,
                            game_link: gameLink,
                            position_element: positionElement,
                            mvp_points_link: mvpLink,
                            acc: Number.parseFloat(element.Scorecard.accuracy * 100)
                                .toFixed(2),
                            hitDiff: Number.parseFloat(element.Scorecard.hit_diff)
                                .toFixed(2),
                            hit_diff_link: hitDiffLink,
                            ...element.Scorecard
                        };
                    });
                    console.log(result);


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
                    title: "Player",
                    render: {
                        _: "player_name",
                        display: "player_link"
                    },
                    responsivePriority: 2
                },
                {
                    data: null,
                    title: "Game",
                    render: {
                        _: "game_name",
                        display: "game_link"
                    }
                },
                {
                    data: null,
                    title: "Position",
                    render: {
                        _: "position",
                        display: "position_element"
                    },
                    responsivePriority: 3
                },
                {
                    data: "score",
                    title: "Score",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "mvp_points",
                    title: "MVP",
                    className: "text-right",
                    responsivePriority: 4
                },
                {
                    data: "hitDiff",
                    title: "Hit Diff",
                    className: "text-right"
                },
                {
                    data: "medic_hits",
                    title: "Medic Hits",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "own_medic_hits",
                    title: "Own Medic Hits"
                },
                {
                    data: "medic_nukes",
                    title: "Medic Nuked Lives"
                },
                {
                    data: "acc",
                    title: "Accuracy",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "survived",
                    title: "Survived Time"
                },
                {
                    data: "lives_left",
                    title: "Lives Left"
                },
                {
                    data: "shots_hit",
                    title: "Shots Hit"
                },
                {
                    data: "shots_fired",
                    title: "Shots Fired"
                },
                {
                    data: "shots_left",
                    title: "Shots Left"
                },
                {
                    data: "shot_3hit",
                    title: "Shot 3-Hit"
                },
                {
                    data: "times_zapped",
                    title: "Times Zapped"
                },
                {
                    data: "missiled_opponent",
                    title: "Missiled Opponent"
                },
                {
                    data: "missiled_team",
                    title: "Missiled Team"
                },
                {
                    data: "times_missiled",
                    title: "Times Missiled"
                },
                {
                    data: "shot_opponent",
                    title: "Shot Opponent"
                },
                {
                    data: "shot_team",
                    title: "Shot Team",
                    orderSequence: ["desc", "asc"],
                    className: "text-right"
                },
                {
                    data: "missile_hits",
                    title: "Missile Hits"
                },
                {
                    data: "nukes_activated",
                    title: "Nukes Activated"
                },
                {
                    data: "nukes_detonated",
                    title: "Nukes Detonated"
                },
                {
                    data: "nukes_canceled",
                    title: "Nukes Canceled"
                },
                {
                    data: "own_nuke_cancels",
                    title: "Own Nuke Cancels"
                },
                {
                    data: "scout_rapid",
                    title: "Rapid Fires"
                },
                {
                    data: "life_boost",
                    title: "Life Boosts"
                },
                {
                    data: "ammo_boost",
                    title: "Shots Boosts"
                },
                {
                    data: "resupplies",
                    title: "Resupplies"
                },
                {
                    data: "bases_destroyed",
                    title: "Bases"
                },
                {
                    data: "penalty_count",
                    title: "Penalties"
                },
                {
                    data: "elim_other_team",
                    title: "Elim Other Team"
                },
                {
                    data: "team_elim",
                    title: "Eliminated"
                }
            ],
            order: [
                [5, "desc"]
            ]
        });

        overall.on('draw.dt', function() {
            overall.buttons().container().appendTo('#overall_wrapper');
        });

        overall.on('order.dt', function() {
            overall.column(0, {
                order: 'applied'
            }).nodes().each(function(cell, i) {
                cell.innerHTML = i + 1;
            });
        }).draw()

        $('#nightlySelectDate').change(function() {
            const params = new URLSearchParams(location.search);
            params.set('date', $(this).val());
            window.location = `${location.pathname}?${params.toString()}`;
        });
    });
</script>