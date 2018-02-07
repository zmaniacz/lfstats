<div id="view_radio" class="btn-group" data-toggle="buttons">
	<label class="btn btn-primary">
		<input type="radio" name="rounds" id="rounds" value="0" autocomplete="off"> Round Play
	</label>
	<label class="btn btn-primary active">
		<input type="radio" name="finals" id="finals" value="0" autocomplete="off" checked> Finals
	</label>
</div>
<hr>
<iframe src="<?= $details['Event']['challonge_link']; ?>" width="100%" height="500" frameborder="0" scrolling="auto" allowtransparency="true"></iframe>
<div>
	<input class="pull-right" type="text" id="search-criteria" placeholder="Search Matches..." />
	<?php foreach($details['Round'] as $round): ?>
        <?php if($round['is_finals']): ?>
            <div class="page-header">
                <h3><?= (($round['is_finals']) ? "Finals" : "Round ".$round['round']); ?></h3>
            </div>
            <?php 
                if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID')))
                    echo $this->Html->link('Add Match', array('controller' => 'leagues', 'action' => 'addMatch', $details['Event']['id'], $round['id']), array('class' => 'btn btn-success'));
            ?>
            <div class="row">
            <?php foreach($round['Match'] as $match): ?>
                <div class="col-md-4 match-panel">
                    <div class="panel panel-primary">
                        <div class="panel-heading">
                            <button type="button" class="btn btn-primary btn-sm pull-right" data-toggle="modal" data-target="#matchModal" target="<?= $this->Html->url(array('controller' => 'leagues', 'action' => 'ajax_getMatchDetails', $match['id'], 'ext' => 'json')); ?>">More...</button>
                            <h5><?= (($round['is_finals']) ? "Finals" : "R".$round['round'])." M".$match['match']; ?></h5>
                        </div>
                        <div class="panel-body">
                            <table class="table table-condensed">
                                <thead>
                                    <tr>
                                        <th>Team</th>
                                        <th>Game 1</th>
                                        <th>Game 2</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <?php
                                                if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                                                    echo "<select id=\"Match{$match['match']}Team1\" 
                                                            class=\"match-select form-control\" 
                                                            data-match-id={$match['id']}
                                                            data-match-number={$match['match']}
                                                            data-round-id={$match['round_id']}
                                                            data-team=1
                                                            >";
                                                    echo "<option value=\"\">Select a team</option>";
                                                    foreach($teams as $key => $value) {
                                                        if($key == $match['team_1_id'])
                                                            echo "<option value=\"$key\" selected>$value</option>";
                                                        else
                                                            echo "<option value=\"$key\">$value</option>";
                                                    }
                                                    echo "</select>";
                                                } else {
                                                    echo (is_null($match['team_1_id'])) ? "TBD" : $this->Html->link($teams[$match['team_1_id']], array('controller' => 'teams', 'action' => 'view', $match['team_1_id']));
                                                }

                                                echo " <strong>{$match['team_1_points']}</strong>";
                                                
                                                if(!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_1_points'] > $match['team_2_points']) {
                                                    echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
                                                }
                                            ?>
                                        </td>
                                        <td class="text-center">
                                            <?php 
                                                if(!empty($match['Game_1'])) {
                                                    if( ($match['Game_1']['winner'] == 'red' && $match['team_1_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_1_id'] == $match['Game_1']['green_team_id']))
                                                        echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    else
                                                        echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                }
                                            ?>
                                        </td>
                                        <td class="text-center">
                                            <?php 
                                                if(!empty($match['Game_2'])) {
                                                    if( ($match['Game_2']['winner'] == 'red' && $match['team_1_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_1_id'] == $match['Game_2']['green_team_id']))
                                                        echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    else
                                                        echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                }
                                            ?>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <?php
                                                if(AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                                                    echo "<select id=\"Match{$match['match']}Team2\" 
                                                            class=\"match-select form-control\" 
                                                            data-match-id={$match['id']}
                                                            data-match-number={$match['match']}
                                                            data-round-id={$match['round_id']}
                                                            data-team=2
                                                            >";
                                                    echo "<option value=\"\">Select a team</option>";
                                                    foreach($teams as $key => $value) {
                                                        if($key == $match['team_2_id'])
                                                            echo "<option value=\"$key\" selected>$value</option>";
                                                        else
                                                            echo "<option value=\"$key\">$value</option>";
                                                    }
                                                    echo "</select>";
                                                } else {
                                                    echo (is_null($match['team_2_id'])) ? "TBD" : $this->Html->link($teams[$match['team_2_id']], array('controller' => 'teams', 'action' => 'view', $match['team_2_id']));
                                                }

                                                echo " <strong>{$match['team_2_points']}</strong>";

                                                if(!empty($match['Game_1']) && !empty($match['Game_2']) && $match['team_2_points'] > $match['team_1_points']) {
                                                    echo " <span class=\"glyphicon glyphicon-star text-warning\"></span>";
                                                }
                                            ?>
                                        </td>
                                        <td class="text-center">
                                            <?php 
                                                if(!empty($match['Game_1'])) {
                                                    if( ($match['Game_1']['winner'] == 'red' && $match['team_2_id'] == $match['Game_1']['red_team_id']) || ($match['Game_1']['winner'] == 'green' && $match['team_2_id'] == $match['Game_1']['green_team_id']))
                                                        echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    else
                                                        echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                }
                                            ?>
                                        </td>
                                        <td class="text-center">
                                            <?php 
                                                if(!empty($match['Game_2'])) {
                                                    if( ($match['Game_2']['winner'] == 'red' && $match['team_2_id'] == $match['Game_2']['red_team_id']) || ($match['Game_2']['winner'] == 'green' && $match['team_2_id'] == $match['Game_2']['green_team_id']))
                                                        echo "<span class=\"glyphicon glyphicon-ok text-success\"></span>";
                                                    else
                                                        echo "<span class=\"glyphicon glyphicon-remove text-danger\"></span>";
                                                }
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
<script>
    $(document).ready(function() {
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
                url: "/leagues/ajax_assignTeam/"+$(this).data('matchId')+"/"+$(this).data('team')+"/"+$(this).val()+".json",
                success: function(data) {
                    toastr.success('Assigned Team')
                },
                error: function(data) {
                    toastr.error('Assignment Failed')
                }
            });
        });

        $('#search-criteria').keyup(function(){
            $('.match-panel').hide();
            var txt = $('#search-criteria').val();
            $('.match-panel').each(function(){
            if($(this).text().toUpperCase().indexOf(txt.toUpperCase()) != -1){
                $(this).show();
            }
            });
        });

        $("#view_radio :input").change(function() {
            var url = "<?= html_entity_decode($this->Html->url(array('controller' => 'leagues', 'action' => 'standings'))); ?>"
            document.location = url;
        });
    });
</script>