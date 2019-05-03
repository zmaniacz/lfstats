<?= $this->element('breadcrumbs'); ?>
<hr>
<h4 class="my-4">
    Game List
</h4>
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="game_list">
    <thead>
        <th>Game</th>
        <th>Time</th>
        <th>Winner Score</th>
        <th>Loser Score</th>
        <th>Game Length</th>
        <th>PDF</th>
    </thead>
</table>
<script type="text/javascript">
$(document).ready(function() {
    const params = new URLSearchParams(location.search);

    $.ajax({
        url: "<?= html_entity_decode($this->Html->url(array('controller' => 'games', 'action' => 'getGameList', 'ext' => 'json'))); ?>"
    }).done(function(response) {

        var data = response.data.map(function(element) {
            let game_name = element.Game.game_name;

            if (!!element.Match.id) {
                game_name = 'R' + element.Match.Round.round + ' M' + element.Match.match +
                    ' G' + element.Game.league_game;
                if (element.Match.Round.is_finals) {
                    game_name += ' (Finals)';
                }
            }

            let red_score = element.Game.red_score + element.Game.red_adj;
            let green_score = element.Game.green_score + element.Game.green_adj;


            let red_team = (element.Game.red_team_id === null) ? 'Red Team : ' + red_score :
                '<a href="/teams/view/' + element.Game.red_team_id + '?' + params
                .toString() +
                '" class="text-danger">' + element.Red_Team.name + ' : ' +
                red_score + '</a>';
            let green_team = (element.Game.green_team_id === null) ? 'Green Team : ' +
                green_score : '<a href="/teams/view/' + element.Game.green_team_id + '?' +
                params.toString() + '" class="text-success">' + element.Green_Team
                .name + ' : ' + green_score + '</a>';

            let winner = '';
            let loser = '';
            if (element.Game.winner === 'red') {
                winner = red_team;
                loser = green_team;
                game_name = '<a href="/games/view/' + element.Game.id + '?' + params
                    .toString() + '" class="text-danger">' + game_name + '</a>';
            } else {
                winner = green_team;
                loser = red_team;
                game_name = '<a href="/games/view/' + element.Game.id + '?' + params
                    .toString() + '" class="text-success">' + game_name + '</a>';
            }

            let pdf = '';
            if (element.Game.pdf_id) {
                pdf = '<a href="http://lfstatsscorecards.objects-us-east-1.dream.io/' +
                    element
                    .Game.pdf_id +
                    '.pdf" class="text-primary" target="_blank">PDF</a>';
            }

            let game_length = "N/A";
            if (element.Game.game_length != null) {
                game_length = element.Game.game_length;
            }

            return {
                game_name: game_name,
                game_datetime: element.Game.game_datetime,
                game_length: game_length,
                winner: winner,
                loser: loser,
                pdf: pdf
            };
        });

        $('#game_list').DataTable({
            pageLength: 25,
            order: [1, 'desc'],
            data: data,
            columns: [{
                    data: "game_name"
                },
                {
                    data: "game_datetime"
                },
                {
                    data: "winner"
                },
                {
                    data: "loser"
                },
                {
                    data: function(row, type, val, meta) {
                        if (type === 'display') {
                            let s = row.game_length;
                            return (s - (s %= 60)) / 60 + (9 < s ? ':' : ':0') + s
                        }
                        return row.game_length;
                    }
                },
                {
                    data: "pdf"
                }
            ]
        });
    });
});
</script>