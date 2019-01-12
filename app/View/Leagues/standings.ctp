<div id="view_radio" class="btn-group" data-toggle="buttons">
    <label class="btn btn-primary active">
        <input type="radio" name="rounds" id="rounds" value="0" autocomplete="off" checked> Round Play
    </label>
    <label class="btn btn-primary">
        <input type="radio" name="finals" id="finals" value="0" autocomplete="off"> Finals
    </label>
</div>
<hr>
<div id="top_accordion" class="panel panel-primary">
    <div class="panel-heading" data-toggle="collapse" data-parent="#top_accordion" data-target="#collapse_standings"
        role="tab" id="standings_heading">
        <h4 class="panel-title">
            Team Standings
        </h4>
    </div>
    <div id="collapse_standings" class="panel-collapse collapse in" role="tabpanel">
        <div class="panel-body">
            <?php
                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                    echo $this->Html->link('New Team', array('controller' => 'leagues', 'action' => 'addTeam'), array('class' => 'btn btn-success'));
                }
            ?>
        </div>
        <div id="round_radio" class="btn-group" data-toggle="buttons">
            <label class="btn btn-primary active">
                <input type="radio" name="rounds" id="round_all" value="0" autocomplete="off" checked> All
            </label>
            <?php foreach ($details['Round'] as $round): ?>
            <?php if (!$round['is_finals']): ?>
            <label class="btn btn-primary">
                <input type="radio" name="rounds" id="round_<?= $round['round']; ?>" value="<?= $round['round']; ?>"
                    autocomplete="off"> Round
                <?= $round['round']; ?>
            </label>
            <?php endif; ?>
            <?php endforeach; ?>
        </div>
        <hr>
        <div class="table-responsive">
            <table class="table table-striped table-bordered table-hover table-condensed" id="team_standings">
                <thead>
                    <th class="col-xs-2">Team</th>
                    <th class="col-xs-1">Points</th>
                    <th class="col-xs-1">Matches Won-Lost</th>
                    <th class="col-xs-1">Games Won-Lost</th>
                    <th class="col-xs-1">Eliminations</th>
                    <th class="col-xs-1">Score Ratio</th>
                </thead>
            </table>
        </div>
    </div>
</div>
<div>
    <?php if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                echo $this->Html->link('Add Round', array('controller' => 'leagues', 'action' => 'addRound'), array('class' => 'btn btn-success'));
            }
    ?>
    <input class="pull-right" type="text" id="search-criteria" placeholder="Search Matches..." />
    <?php foreach ($details['Round'] as $round): ?>
    <?php if (!$round['is_finals']): ?>
    <div class="page-header">
        <h3>
            <?= (($round['is_finals']) ? "Finals" : "Round ".$round['round']); ?>
        </h3>
    </div>
    <?php
                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                    echo $this->Html->link('Add Match', array('controller' => 'leagues', 'action' => 'addMatch', $details['Event']['id'], $round['id']), array('class' => 'btn btn-success'));
                }
            ?>
    <div class="row">
        <?php foreach ($round['Match'] as $match): ?>
        <?php
                    $team1Game1Score = $team2Game1Score = $team1Game2Score = $team2Game2Score = 0;
                    if (!empty($match['Game_1'])) {
                        $game1Url = $this->Html->url(array('controller' => 'Games', 'action' => 'view', $match['Game_1']['id']));
                        $team1Game1Score = $match['Game_1']['red_score']+$match['Game_1']['red_adj'];
                        $team2Game1Score = $match['Game_1']['green_score']+$match['Game_1']['green_adj'];
                    }

                    if (!empty($match['Game_2'])) {
                        $game2Url = $this->Html->url(array('controller' => 'Games', 'action' => 'view', $match['Game_2']['id']));
                        $team1Game2Score = $match['Game_2']['green_score']+$match['Game_2']['green_adj'];
                        $team2Game2Score = $match['Game_2']['red_score']+$match['Game_2']['red_adj'];
                    }
                ?>
        <div class="col-md-6 match-panel">
            <div class="panel panel-primary">
                <div class="panel-body">
                    <table class="table table-condensed">
                        <caption>Match
                            <?= $match['match']; ?>
                        </caption>
                        <thead>
                            <tr>
                                <th>Team</th>
                                <th class="text-center">Game 1</th>
                                <th class="text-center">Game 2</th>
                                <th class="text-center">Score Diff</th>
                                <th class="text-center">Match Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <?php
                                                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                                                    echo "<select id=\"Match{$match['match']}Team1\" 
															class=\"match-select form-control\" 
															data-match-id={$match['id']}
															data-match-number={$match['match']}
															data-round-id={$match['round_id']}
															data-team=1
															>";
                                                    echo "<option value=\"\">Select a team</option>";
                                                    foreach ($teams as $key => $value) {
                                                        if ($key == $match['team_1_id']) {
                                                            echo "<option value=\"$key\" selected>$value</option>";
                                                        } else {
                                                            echo "<option value=\"$key\">$value</option>";
                                                        }
                                                    }
                                                    echo "</select>";
                                                } else {
                                                    echo (is_null($match['team_1_id'])) ? "TBD" : $this->Html->link($teams[$match['team_1_id']], array('controller' => 'teams', 'action' => 'view', $match['team_1_id']));
                                                    if (!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_1_points'] > $match['team_2_points']) {
                                                        echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
                                                    }
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                if (!empty($match['Game_1'])) {
                                                    echo "<a href=\"$game1Url\">$team1Game1Score</a>";
                                                    if (($match['Game_1']['winner'] == 'red' && $match['team_1_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_1_id'] == $match['Game_1']['green_team_id'])) {
                                                        echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    } else {
                                                        echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                    }
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                if (!empty($match['Game_2'])) {
                                                    echo "<a href=\"$game2Url\">$team1Game2Score</a>";
                                                    if (($match['Game_2']['winner'] == 'red' && $match['team_1_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_1_id'] == $match['Game_2']['green_team_id'])) {
                                                        echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    } else {
                                                        echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                    }
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                if ($team1Game1Score+$team1Game2Score > $team2Game1Score+$team2Game2Score) {
                                                    echo "+".(($team1Game1Score+$team1Game2Score) - ($team2Game1Score+$team2Game2Score));
                                                } else {
                                                    echo "-".(($team1Game1Score+$team1Game2Score) - ($team2Game1Score+$team2Game2Score));
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                echo " <strong>{$match['team_1_points']}</strong>";
                                            ?>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <?php
                                                if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                                                    echo "<select id=\"Match{$match['match']}Team2\" 
															class=\"match-select form-control\" 
															data-match-id={$match['id']}
															data-match-number={$match['match']}
															data-round-id={$match['round_id']}
															data-team=2
															>";
                                                    echo "<option value=\"\">Select a team</option>";
                                                    foreach ($teams as $key => $value) {
                                                        if ($key == $match['team_2_id']) {
                                                            echo "<option value=\"$key\" selected>$value</option>";
                                                        } else {
                                                            echo "<option value=\"$key\">$value</option>";
                                                        }
                                                    }
                                                    echo "</select>";
                                                } else {
                                                    echo (is_null($match['team_2_id'])) ? "TBD" : $this->Html->link($teams[$match['team_2_id']], array('controller' => 'teams', 'action' => 'view', $match['team_2_id']));
                                                    if (!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_2_points'] > $match['team_1_points']) {
                                                        echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
                                                    }
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                if (!empty($match['Game_1'])) {
                                                    echo "<a href=\"$game1Url\">$team2Game1Score</a>";
                                                    if (($match['Game_1']['winner'] == 'red' && $match['team_2_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_2_id'] == $match['Game_1']['green_team_id'])) {
                                                        echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    } else {
                                                        echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                    }
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                if (!empty($match['Game_2'])) {
                                                    echo "<a href=\"$game2Url\">$team2Game2Score</a>";
                                                    if (($match['Game_2']['winner'] == 'red' && $match['team_2_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_2_id'] == $match['Game_2']['green_team_id'])) {
                                                        echo " <span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    } else {
                                                        echo " <span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                    }
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                if ($team2Game1Score+$team2Game2Score > $team1Game1Score+$team1Game2Score) {
                                                    echo "+".(($team2Game1Score+$team2Game2Score) - ($team1Game1Score+$team1Game2Score));
                                                } else {
                                                    echo "-".(($team2Game1Score+$team2Game2Score) - ($team1Game1Score+$team1Game2Score));
                                                }
                                            ?>
                                </td>
                                <td class="text-center">
                                    <?php
                                                echo " <strong>{$match['team_2_points']}</strong>";
                                            ?>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
    <?php endforeach; ?>
</div>
<div class="modal fade" id="teamNameModal" tabindex="-1" role="dialog">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <button type="button" class="close" data-dismiss="modal">&times;</button>
                <h4 class="modal-title" id="teamNameModalLabel">Team Name:</h4>
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
                <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="teamNameModalSaveBtn">Save</button>
            </div>
        </div>
    </div>
</div>
<div class="modal fade" id="addTeamMatchPenaltyModal" tabindex="-1" role="dialog">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <button type="button" class="close" data-dismiss="modal">&times;</button>
                <h4 class="modal-title" id="addTeamMatchPenaltyModalLabel">Add Match Penalty</h4>
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
                <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="addTeamMatchPenaltyModalFormSaveBtn">Save</button>
            </div>
        </div>
    </div>
</div>
<div class="modal fade" id="viewTeamMatchPenaltyModal" tabindex="-1" role="dialog">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <button type="button" class="close" data-dismiss="modal">&times;</button>
                <h4 class="modal-title" id="addTeamMatchPenaltyModalLabel">Team Penalties</h4>
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
                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>
<script>
    $(document).ready(function() {
        const loggedIn =
            <?php
            if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                echo "true";
            } else {
                echo "false";
            }
        ?>;

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
                processing: true,
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
                                    `<a class="pull-right delete-match-penalty-link" href="#" data-penalty-id=${row.id} data-dismiss="modal"><span class="glyphicon glyphicon-trash"></span></a>`;
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

        var standings_data
        var standings_table = $('#team_standings').DataTable({
            "processing": true,
            "order": [
                [1, "desc"]
            ],
            "columns": [{
                    data: function(row, type, val, meta) {
                        if (type === 'display' && loggedIn) {
                            return row.link +
                                ' <a class="pull-right" data-toggle="modal" data-team-id="' +
                                row.id +
                                '" data-team-name="' + row.name +
                                '" href="#teamNameModal"><span class="glyphicon glyphicon-pencil"></span></a>';
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
                                result += ' <a data-toggle="modal" data-team-id="' + row.id +
                                    '" href="#viewTeamMatchPenaltyModal">(' +
                                    row.adjustment + ')</a>';
                            }

                            return result +
                                ' <a class="pull-right" data-toggle="modal" data-team-id="' +
                                row.id +
                                '" href="#addTeamMatchPenaltyModal"><span class="glyphicon glyphicon-pencil"></span></a>';
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
                    data: "score_ratio"
                },
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
                "<?= html_entity_decode($this->Html->url(array('controller' => 'leagues', 'action' => 'ajax_getTeamStandings', 'ext' => 'json'))); ?>"

            if (round > 0) {
                url = url.replace(".json", "/" + round + ".json")
            }
            table.ajax.url(url).load();

            setTimeout(update_standings, 30000);
        }

        $("#round_radio :input").change(function() {
            update_standings(standings_table, this.value)
        });

        $("#view_radio :input").change(function() {
            var url =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'leagues', 'action' => 'bracket'))); ?>"
            document.location = url;
        });

        update_standings(standings_table, 0)
    });
</script>