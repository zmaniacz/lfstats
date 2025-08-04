<?php echo $this->element('breadcrumbs'); ?>
<hr>
<div id="view_radio" class="btn-group">
    <input type="radio" class="btn-check" name="rounds" id="rounds" autocomplete="off" checked>
    <label class="btn btn-outline-info" for="rounds">Round Play</label>
    <input type="radio" class="btn-check" name="rounds" id="finals" autocomplete="off">
    <label class="btn btn-outline-info" for="finals">Finals</label>
</div>
<h4 class="my-4">
    Team Standings
</h4>
<div id="round_radio" class="btn-group">
    <input type="radio" class="btn-check" name="standing_rounds" id="round_all" value="0" autocomplete="off" checked>
    <label class="btn btn-outline-info" for="round_all">All</label>
    <?php foreach ($details['Round'] as $round) { ?>
        <?php if (!$round['is_finals']) { ?>
            <input type="radio" class="btn-check" name="standing_rounds" id="round_<?php echo $round['round']; ?>" value="<?php echo $round['round']; ?>" autocomplete="off">
            <label class="btn btn-outline-info" for="round_<?php echo $round['round']; ?>">Round <?php echo $round['round']; ?></label>
        <?php } ?>
    <?php } ?>
</div>
<hr>
<?php if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) { ?>
    <a class="btn btn-success" href="<?php echo $this->Html->url(['controller' => 'leagues', 'action' => 'addTeam']); ?>">New
        Team</a> <a href="<?php echo $this->Html->url(['controller' => 'Events', 'action' => 'edit', $details['Event']['id']]); ?>"><i class="material-icons">settings</i></a>
<?php } ?>
<div class="table-responsive">
    <table class="table table-bordered table-hover table-sm nowrap" id="team_standings">
        <thead>
            <th style="width: 20%">Team</th>
            <th style="width: 15%">Points</th>
            <th style="width: 15%">Matches Won-Lost</th>
            <th style="width: 15%">Games Won-Lost</th>
            <th style="width: 15%">Eliminations</th>
            <th style="width: 20%">Score Ratio</th>
        </thead>
    </table>
</div>
<hr>
<div class="mt-4">
    <?php if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
        echo $this->Html->link('Add Round', ['controller' => 'leagues', 'action' => 'addRound'], ['class' => 'btn btn-success']);
    }
    ?>
    <input class="float-right" type="text" id="search-criteria" placeholder="Search Matches..." />
    <?php foreach ($details['Round'] as $round) { ?>
        <?php if (!$round['is_finals']) { ?>
            <h3 class="my-4">
                <?php echo ($round['is_finals']) ? 'Finals' : 'Round ' . $round['round']; ?>
            </h3>
            <?php
            if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                echo $this->Html->link('Add Match', ['controller' => 'leagues', 'action' => 'addMatch', $details['Event']['id'], $round['id']], ['class' => 'btn btn-success']);
            }
            ?>
            <div class="row">
                <?php foreach ($round['Match'] as $match) {
                    echo $this->element('MatchCard', [
                        'match' => $match,
                    ]);
                }
                ?>
            </div>
        <?php } ?>
    <?php } ?>
</div>
<div class="modal fade" id="teamNameModal" tabindex="-1" role="dialog">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="teamNameModalLabel">Team Name:</h4>
                <button type="button" class="btn-close" data-bs-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="teamNameModalForm" method="post">
                    <div class="form-group">
                        <label for="team-name" class="control-label">Name:</label>
                        <input type="text" class="form-control" id="team-name" name="team-name">
                        <input type="hidden" id="team-id" name="team-id">
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="teamNameModalSaveBtn">Save</button>
            </div>
        </div>
    </div>
</div>
<div class="modal fade" id="addTeamMatchPenaltyModal" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-sm">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="addTeamMatchPenaltyModalLabel">Add Match Penalty</h4>
                <button type="button" class="btn-close" data-bs-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="addTeamMatchPenaltyModalForm" method="post">
                    <div class="form-group">
                        <label for="match-penalty-type" class="control-label">Type:</label>
                        <input type="text" class="form-control" id="match-penalty-type" name="match-penalty-type">
                        <label for="match-penalty-description" class="control-label">Description:</label>
                        <input type="text" class="form-control" id="match-penalty-description" name="match-penalty-description">
                        <label for="match-penalty-value" class="control-label">Value:</label>
                        <input type="text" class="form-control" id="match-penalty-value" name="match-penalty-value">
                        <input type="hidden" id="match-penalty-team-id" name="match-penalty-team-id">
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="addTeamMatchPenaltyModalFormSaveBtn">Save</button>
            </div>
        </div>
    </div>
</div>
<div class="modal fade" id="viewTeamMatchPenaltyModal" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-sm">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="addTeamMatchPenaltyModalLabel">Team Penalties</h4>
                <button type="button" class="btn-close" data-bs-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="table-responsive">
                    <table class="table table-bordered table-hover table-condensed" id="teamMatchPenaltyTable">
                        <thead>
                            <th class="col-xs-8">Type</th>
                            <th class="col-xs-4">Value</th>
                        </thead>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>
<script>
    $(document).ready(function() {
        <?php if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) { ?>
            const loggedIn = true;
        <?php } else { ?>
            const loggedIn = false;
        <?php } ?>

        $('#teamNameModal').on('show.bs.modal', function(event) {
            let button = $(event.relatedTarget)
            let teamId = button.data('team-id')
            let teamName = button.data('team-name')
            let modal = $(this)
            modal.find('#team-name').val(teamName)
            modal.find('#team-id').val(teamId)
        });

        $('#teamNameModalSaveBtn').click(function() {
            $.post('/teams/setName', $('#teamNameModalForm').serialize())
                .done(function(data) {
                    toastr.success('Updated Name');
                    update_standings(standings_table, 0);
                });

            $('#teamNameModal').modal('hide');
        });

        $('#addTeamMatchPenaltyModal').on('show.bs.modal', function(event) {
            let button = $(event.relatedTarget)
            let teamId = button.data('team-id')
            let modal = $(this)
            $("#addTeamMatchPenaltyModalForm").trigger('reset')
            modal.find('#match-penalty-team-id').val(teamId)
        });

        $('#addTeamMatchPenaltyModalFormSaveBtn').click(function() {
            $.post('/teams/addMatchPenalty', $('#addTeamMatchPenaltyModalForm').serialize())
                .done(function(data) {
                    toastr.success('Added Penalty');
                    update_standings(standings_table, 0);
                });

            $('#addTeamMatchPenaltyModal').modal('hide');
        });

        $('#viewTeamMatchPenaltyModal').on('show.bs.modal', function(event) {
            let teamId = $(event.relatedTarget).data('team-id');

            $('#teamMatchPenaltyTable').DataTable({
                searching: false,
                ajax: {
                    url: `/teams/getMatchPenalties/${teamId}.json`
                },
                columns: [{
                        data: "type"
                    },
                    {
                        data: function(row, type, val, meta) {
                            if (type === 'display' && loggedIn) {
                                return row.value +
                                    `<a class="pull-right delete-match-penalty-link" href="#" data-penalty-id=${row.id} data-bs-dismiss="modal"><span class="glyphicon glyphicon-trash"></span></a>`;
                            } else {
                                return row.value;
                            }
                        }
                    }
                ]
            });
        });

        $('#viewTeamMatchPenaltyModal').on('hidden.bs.modal', function(event) {
            $('#teamMatchPenaltyTable').DataTable().destroy();
        });

        $('#viewTeamMatchPenaltyModal').on('click', '.delete-match-penalty-link', function(event) {
            let penaltyId = $(this).data('penalty-id');
            $.post(`/teams/deleteMatchPenalty/${penaltyId}`)
                .done(function(data) {
                    toastr.success('Deleted Penalty');
                    update_standings(standings_table, 0);
                });
        });

        var standings_table = $('#team_standings').DataTable({
            paging: false,
            info: false,
            searching: false,
            ordering: false,
            columns: [{
                    data: function(row, type, val, meta) {
                        if (type === 'display' && loggedIn) {
                            return row.link +
                                ' <a class="float-right" data-bs-toggle="modal" data-team-id="' +
                                row.id +
                                '" data-team-name="' + row.name +
                                '" href="#teamNameModal"><i class="material-icons">edit</i></a>';
                        } else {
                            return row.link;
                        }
                    }
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display' && loggedIn) {
                            let result = row.points;
                            if (row.adjustment !== null) {
                                result += ' <a data-bs-toggle="modal" data-team-id="' + row.id +
                                    '" href="#viewTeamMatchPenaltyModal">(' +
                                    row.adjustment + ')</a>';
                            }

                            return result +
                                ' <a class="float-right" data-bs-toggle="modal" data-team-id="' +
                                row.id +
                                '" href="#addTeamMatchPenaltyModal"><i class="material-icons">edit</i></a>';
                        } else {
                            return row.points;
                        }
                    }
                },
                {
                    data: "match_win_lose"
                },
                {
                    data: "game_win_lose"
                },
                {
                    data: "elims"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            return row.score_ratio;
                        } else {
                            return row.ratio;
                        }
                    }
                }
            ]
        });

        $('.match-select').change(function() {
            toastr.options = {
                "closeButton": false,
                "debug": false,
                "newestOnTop": false,
                "progressBar": false,
                "positionClass": "toast-top-right",
                "preventDuplicates": false,
                "onclick": null,
                "showDuration": "300",
                "hideDuration": "1000",
                "timeOut": "3000",
                "extendedTimeOut": "1000",
                "showEasing": "swing",
                "hideEasing": "linear",
                "showMethod": "slideDown",
                "hideMethod": "slideUp"
            }
            $.ajax({
                url: "/leagues/ajax_assignTeam/" + $(this).data('matchId') + "/" + $(this).data(
                        'team') + "/" + $(this).val() +
                    ".json",
                success: function(data) {
                    toastr.success('Assigned Team')
                },
                error: function(data) {
                    toastr.error('Assignment Failed')
                }
            });
        });

        $('#search-criteria').keyup(function() {
            $('.match-panel').hide();
            var txt = $('#search-criteria').val();
            $('.match-panel').each(function() {
                if ($(this).text().toUpperCase().indexOf(txt.toUpperCase()) != -1) {
                    $(this).show();
                }
            });
        });

        function update_standings(table, round) {
            var url =
                "<?php echo html_entity_decode($this->Html->url(['controller' => 'leagues', 'action' => 'ajax_getTeamStandings', 'ext' => 'json'])); ?>"

            if (round > 0) {
                url = url.replace(".json", "/" + round + ".json")
            }
            table.ajax.url(url).load();

            /*setTimeout(function() {
                update_standings(table, round);
            }, 30000)*/
        }

        $("#round_radio :input").change(function() {
            update_standings(standings_table, this.value)
        });

        $("#view_radio :input").change(function() {
            var url =
                "<?php echo html_entity_decode($this->Html->url(['controller' => 'leagues', 'action' => 'bracket'])); ?>"
            document.location = url;
        });

        update_standings(standings_table, 0)
    });
</script>