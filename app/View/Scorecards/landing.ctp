<div class="jumbotron jumbotron-fluid">
    <div class="container">
    <img src="img/2019-Detroit.jpg" class="img-fluid" alt="Responsive image">    
        <hr class="my-4">
        <p><a class="btn btn-primary btn-lg"
                href="/leagues/standings?gametype=league&amp;leagueID=853&amp;centerID=7&amp;isComp=1">Details
                <i class="material-icons">chevron_right</i></a></p>
    </div>
</div>
<div class="row">
    <div class="col-8 offset-2 col-sm-3 offset-sm-3">
        <select id="jump-social" class="custom-select">
            <option selected>Jump to social games</option>
            <?php
                    $sorted_centers = $centers;
                    asort($sorted_centers);
                    foreach ($sorted_centers as $key => $value) {
                        $link = $this->Html->url(array(
                            'controller' => 'scorecards',
                            'action' => 'nightly',
                            implode(",", $this->request->pass),
                            '?' => array(
                                'gametype' => 'social',
                                'isComp' => 0,
                                'centerID' => $key
                            )
                        ));
                        echo '<option value="'.$link.'">'.$value.'</option>';
                    }
                ?>
        </select>
    </div>
    <div class="col-8 offset-2 col-sm-3 offset-sm-0">
        <select id="jump-comp" class="custom-select">
            <option selected>Jump to competition</option>
            <?php
                foreach ($league_details as $league) {
                    debug($league);
                    $link = $this->Html->url(array(
                        'controller' => 'leagues',
                        'action' => 'standings',
                        implode(",", $this->request->pass),
                        '?' => array(
                            'gametype' => 'league',
                            'isComp' => 1,
                            'centerID' => $league['Event']['center_id'],
                            'leagueID' => $league['Event']['id']
                        )
                    ));
                    echo '<option value="'.$link.'">'.$league['Event']['name'].'</option>';
                }
                ?>
        </select>

    </div>
</div>
<hr class="my-4">
<div class="row">
    <div class="col-12 col-sm-8 offset-sm-2">
        <table class="table table-striped table-sm table-bordered table-hover" id="events_list">
            <thead>
                <tr>
                    <th class="col-xs-4">Center</th>
                    <th class="col-xs-4 text-right">Date</th>
                    <th class="col-xs-4 text-right">Games Played</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        </table>
    </div>
</div>
<script type="text/javascript">
$(document).ready(function() {
    let params = new URLSearchParams();
    let
        events = <?= json_encode($events, JSON_NUMERIC_CHECK, JSON_FORCE_OBJECT); ?>;
    let table = $('#events_list tbody');

    events.forEach(function(item) {
        params.set('gametype', item.Event.type);
        params.set('centerID', item.Center.id);
        params.set('leagueID', (item.Event.is_comp) ? item.Event.id : 0);
        params.set('isComp', (item.Event.is_comp) ? 1 : 0);
        params.set('date', item.Event.last_gamedate);

        let eventName = (item.Event.is_comp) ? item.Event.name :
            `${item.Center.name} - <span class="text-capitalize">${item.Event.type}`;

        let eventLink =
            `<a href="/scorecards/nightly?${params.toString()}">${eventName}</a>`;

        let row =
            `<tr>
                <td>${eventLink}</td>
                <td class="text-right">${item.Event.last_gamedate}</td>
                <td class="text-right">${item.Event.games_played}</td>
            </tr>`;
        table.append(row);
    });

    $('#jump-social').change(function() {
        window.location = $(this).val();
    });

    $('#jump-comp').change(function() {
        window.location = $(this).val();
    });
});
</script>