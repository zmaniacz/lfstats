<?php echo $this->element('breadcrumbs'); ?>
<hr>
<h4 class="my-4">
    Player Standings
</h4>
<?php if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) { ?>
<a class="btn btn-success my-2" data-toggle="modal" href="#addPlayerModal">Add Player</a>
<?php } ?>
<div class="table-responsive">
    <table class="table table-striped table-bordered table-hover table-sm nowrap" id="solo_standings">
        <thead>
            <th style="width: 25%">Player</th>
            <th style="width: 10%">Total MVP</th>
            <th style="width: 10%">Proj. MVP</th>
            <th style="width: 10%">Handicap</th>
            <th style="width: 15%">Avg MVP</th>
            <th style="width: 15%">Avg Score</th>
            <th style="width: 15%">Win %</th>
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
<script>
    $(document).ready(function() {
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
                        if (type === 'display' && false) {
                            return row.link +
                                ' <a class="float-right" data-toggle="modal" data-team-id="' +
                                row.id +
                                '" data-team-name="' + row.name +
                                '" href="#teamNameModal"><i class="material-icons">edit</i></a>';
                        } else {
                            return row.Player.player_name;
                        }
                    }
                },
                {
                    data: "Player.player_name"
                },
                {
                    data: "Player.player_name"
                },
                {
                    data: "Player.player_name"
                },
                {
                    data: "Player.player_name"
                },
                {
                    data: "Player.player_name"
                },
                {
                    data: "Player.player_name"
                },
            ]
        });

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

        function updateSoloStandings(table) {
            table.ajax.url(
                '/leagues/getSoloStandings/<?php echo $selected_league['Event']['id']; ?>.json'
            ).load();
        }

        updateSoloStandings(soloStandingsTable);
    });
</script>