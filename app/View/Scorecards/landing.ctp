<div class="jumbotron jumbotron-fluid">
    <div class="container">
        <h1 class="display-4">2019 Syracuse Random Draw</h1>
        <hr class="my-4">
        <p><a class="btn btn-primary btn-lg"
                href="/leagues/standings?gametype=league&amp;leagueID=687&amp;centerID=8&amp;isComp=1">Details
                <i class="fas fa-caret-right"></i></a></p>
    </div>
</div>
<div class="row">
    <div class="col-8 offset-2 col-sm-3 offset-sm-3">
        <div class="dropdown">
            <button class="btn btn-outline-secondary dropdown-toggle" type="button" id="socialDropDown"
                data-toggle="dropdown">Jump to social games</button>
            <div class="dropdown-menu">
                <h6 class="dropdown-header">Centers</h6>
                <?php
                    $sorted_centers = $centers;
                    asort($sorted_centers);
                    foreach ($sorted_centers as $key => $value) {
                        echo $this->Html->link($value, array(
                            'controller' => 'scorecards',
                            'action' => 'nightly',
                            implode(",", $this->request->pass),
                            '?' => array(
                                'gametype' => $this->Session->read('state.gametype'),
                                'centerID' => $key,
                                'leagueID' => 0
                            )
                        ), array('class' => 'dropdown-item'));
                    }
                ?>
            </div>
        </div>
    </div>
    <div class="col-8 offset-2 col-sm-3 offset-sm-0">
        <div class="dropdown">
            <button class="btn btn-outline-secondary dropdown-toggle" type="button" id="compDropDown"
                data-toggle="dropdown">Jump to competition</button>
            <div class="dropdown-menu">
                <h6 class="dropdown-header">Competitions</h6>
                <?php
                    foreach ($league_details as $league) {
                        echo $this->Html->link($league['Event']['name'], array(
                            'controller' => 'leagues',
                            'action' => 'standings',
                            implode(",", $this->request->pass),
                            '?' => array(
                                'gametype' => 'league',
                                'centerID' => $league['Event']['center_id'],
                                'leagueID' => $league['Event']['id']
                            )
                        ), array('class' => 'dropdown-item'));
                    }
                ?>
            </div>
        </div>
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
});
</script>