<div class="row">
    <p>2021-12-31 - Significant updates to the live replay engine. Click the 'Repaly Beta' link on any game page to check it out.</p>
</div>
<div class="row">
    <div class="col-8 offset-2 col-sm-3 offset-sm-3">
        <select id="jump-social" class="custom-select">
            <option selected>Jump to social games</option>
            <?php
            $sorted_centers = $centers;
            asort($sorted_centers);
            foreach ($sorted_centers as $key => $value) {
                $link = $this->Html->url([
                    'controller' => 'scorecards',
                    'action' => 'nightly',
                    implode(',', $this->request->pass),
                    '?' => [
                        'gametype' => 'social',
                        'isComp' => 0,
                        'centerID' => $key,
                    ],
                ]);
                echo '<option value="' . $link . '">' . $value . '</option>';
            }
            ?>
        </select>
    </div>
    <div class="col-8 offset-2 col-sm-3 offset-sm-0">
        <select id="jump-comp" class="custom-select">
            <option selected>Jump to competition</option>
            <?php
            foreach ($league_details as $league) {
                $link = $this->Html->url([
                    'controller' => 'leagues',
                    'action' => 'standings',
                    implode(',', $this->request->pass),
                    '?' => [
                        'gametype' => 'league',
                        'isComp' => 1,
                        'centerID' => $league['Event']['center_id'],
                        'leagueID' => $league['Event']['id'],
                    ],
                ]);
                echo '<option value="' . $link . '">' . $league['Event']['name'] . '</option>';
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
            events = <?php echo json_encode($events, JSON_NUMERIC_CHECK, JSON_FORCE_OBJECT); ?>;
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