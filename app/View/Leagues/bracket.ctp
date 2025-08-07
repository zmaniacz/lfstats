<?= $this->element('breadcrumbs'); ?>
<hr>
<div id="view_radio" class="btn-group">
    <input type="radio" class="btn-check" name="rounds" id="rounds" autocomplete="off" checked>
    <label class="btn btn-outline-info" for="rounds">Round Play</label>
    <input type="radio" class="btn-check" name="rounds" id="finals" autocomplete="off">
    <label class="btn btn-outline-info" for="finals">Finals</label>
</div>
<?php if ($details['Event']['challonge_link']) : ?>
    <h4 class="my-4">
        Finals Bracket
    </h4>
    <div>
        <iframe src="<?= $details['Event']['challonge_link']; ?>?show_final_results=1&show_standings=1" width="100%" height="500" frameborder="0" scrolling="auto" allowtransparency="true"></iframe>
    </div>
    <hr>
<?php endif; ?>
<div class="mt-4">
    <input class="float-right" type="text" id="search-criteria" placeholder="Search Matches..." />
    <?php foreach ($details['Round'] as $round) : ?>
        <?php if ($round['is_finals']) : ?>
            <h3 class="my-4">
                Finals
            </h3>
            <?php
            if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))) {
                echo $this->Html->link('Add Match', array('controller' => 'leagues', 'action' => 'addMatch', $details['Event']['id'], $round['id']), array('class' => 'btn btn-success'));
            }
            ?>
            <div class="row">
                <?php foreach ($round['Match'] as $match) {
                    echo $this->element('MatchCard', array(
                        "match" => $match
                    ));
                }
                ?>
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
                url: "/leagues/ajax_assignTeam/" + $(this).data('matchId') + "/" + $(this).data(
                    'team') + "/" + $(this).val() + ".json",
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

        $("#view_radio :input").change(function() {
            var url =
                "<?= html_entity_decode($this->Html->url(array('controller' => 'leagues', 'action' => 'standings'))); ?>"
            document.location = url;
        });
    });
</script>
