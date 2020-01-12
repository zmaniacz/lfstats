<?php

App::uses('AppModel', 'Model');

class Player extends AppModel
{
    public $displayField = 'player_name';

    public $belongsTo = [
        'Center' => [
            'className' => 'Center',
            'foreignKey' => 'center_id',
        ],
    ];

    public $hasMany = [
        'Scorecard' => [
            'className' => 'Scorecard',
            'foreignKey' => 'player_id',
            'dependent' => false,
        ],
        'PlayersName' => [
            'className' => 'PlayersName',
            'foreignKey' => 'player_id',
            'dependent' => false,
        ],
        'PlayerHits' => [
            'className' => 'Hit',
            'foreignKey' => 'player_id',
        ],
        'HitPlayer' => [
            'className' => 'Hit',
            'foreignKey' => 'target_id',
        ],
        'GameResult' => [
            'className' => 'GameResult',
            'foreignKey' => 'player_id',
        ],
        'GameAction' => [
            'className' => 'GameAction',
            'foreignKey' => 'player_id',
        ],
        'GameActionTarget' => [
            'className' => 'GameAction',
            'foreignKey' => 'target_id',
        ],
        'GameDelta' => [
            'className' => 'GameDelta',
            'foreignKey' => 'player_id',
        ],
    ];

    public function getPlayerStats($id, $role = null, $state = null)
    {
        $conditions = [];
        if (!is_null($role)) {
            $conditions[] = ['position' => $role];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        return $this->find('all', [
            'conditions' => ['id' => $id],
            'contain' => [
                'Scorecard' => [
                    'conditions' => $conditions,
                    'order' => 'Scorecard.game_datetime',
                ],
            ],
        ]);
    }

    public function getPlayerGames($id)
    {
        return $this->query(
            "SELECT * 
			FROM  games,
			(
				SELECT game_id
				FROM  scorecards 
				WHERE player_id={$id}
			) AS scores
			WHERE games.id = scores.game_id
			ORDER BY  games.game_datetime DESC"
        );
    }

    public function getPlayerWinsLosses($id = null)
    {
        $conditions = [];

        if (!is_null($id)) {
            $conditions[] = ['player_id' => $id];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        return $this->GameResult->find('all', [
            'fields' => [
                'player_id',
                'SUM(won) AS games_won',
                'count(game_id) AS games_played',
            ],
            'conditions' => $conditions,
            'group' => 'player_id',
        ]);
    }

    public function getAverageScoreByPosition($id = null, $state = null)
    {
        $conditions = [];

        if (!is_null($id)) {
            $conditions[] = ['player_id' => $id];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        $raw = $this->Scorecard->find('all', [
            'fields' => [
                'position',
                'AVG(score) as avg_score',
            ],
            'conditions' => $conditions,
            'group' => 'position',
            'order' => 'position',
        ]);

        $averages = ['Ammo Carrier' => 0, 'Commander' => 0, 'Heavy Weapons' => 0, 'Medic' => 0, 'Scout' => 0];
        foreach ($raw as $item) {
            $averages[$item['Scorecard']['position']] = $item[0]['avg_score'];
        }

        return $averages;
    }

    public function getAverageMVPByPosition($id = null, $state = null)
    {
        $conditions = [];

        if (!is_null($id)) {
            $conditions[] = ['player_id' => $id];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['event_id' => $state['leagueID']];
        }

        $raw = $this->Scorecard->find('all', [
            'fields' => [
                'position',
                'AVG(mvp_points) as avg_mvp',
            ],
            'conditions' => $conditions,
            'group' => 'position',
            'order' => 'position',
        ]);

        $averages = ['Ammo Carrier' => 0, 'Commander' => 0, 'Heavy Weapons' => 0, 'Medic' => 0, 'Scout' => 0];
        foreach ($raw as $item) {
            $averages[$item['Scorecard']['position']] = $item[0]['avg_mvp'];
        }

        return $averages;
    }

    public function getMedianScoreByPosition($id = null, $state = null)
    {
        $fields = ['position', 'score'];
        $conditions = [];

        if (!is_null($id)) {
            $fields[] = 'player_id';
            $conditions[] = ['Scorecard.player_id' => $id];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        $scores = $this->Scorecard->find('all', [
            'fields' => $fields,
            'conditions' => $conditions,
            'order' => 'score ASC',
        ]);

        $commander = [];
        $heavy = [];
        $scout = [];
        $ammo = [];
        $medic = [];

        foreach ($scores as $score) {
            switch ($score['Scorecard']['position']) {
                case 'Commander':
                    $commander[] = $score['Scorecard']['score'];

                    break;
                case 'Heavy Weapons':
                    $heavy[] = $score['Scorecard']['score'];

                    break;
                case 'Scout':
                    $scout[] = $score['Scorecard']['score'];

                    break;
                case 'Ammo Carrier':
                    $ammo[] = $score['Scorecard']['score'];

                    break;
                case 'Medic':
                    $medic[] = $score['Scorecard']['score'];

                    break;
            }
        }

        if (count($commander) > 0) {
            $results['commander'] = $commander[floor((count($commander) - 1) * .5)];
            $results['commander_lower'] = $commander[floor((count($commander) - 1) * .25)];
            $results['commander_upper'] = $commander[floor((count($commander) - 1) * .75)];
            $results['commander_min'] = $commander[0];
            $results['commander_max'] = $commander[(count($commander) - 1)];
        }

        if (count($heavy) > 0) {
            $results['heavy'] = $heavy[floor((count($heavy) - 1) * .5)];
            $results['heavy_lower'] = $heavy[floor((count($heavy) - 1) * .25)];
            $results['heavy_upper'] = $heavy[floor((count($heavy) - 1) * .75)];
            $results['heavy_min'] = $heavy[0];
            $results['heavy_max'] = $heavy[(count($heavy) - 1)];
        }

        if (count($scout) > 0) {
            $results['scout'] = $scout[floor((count($scout) - 1) * .5)];
            $results['scout_lower'] = $scout[floor((count($scout) - 1) * .25)];
            $results['scout_upper'] = $scout[floor((count($scout) - 1) * .75)];
            $results['scout_min'] = $scout[0];
            $results['scout_max'] = $scout[(count($scout) - 1)];
        }

        if (count($ammo) > 0) {
            $results['ammo'] = $ammo[floor((count($ammo) - 1) * .5)];
            $results['ammo_lower'] = $ammo[floor((count($ammo) - 1) * .25)];
            $results['ammo_upper'] = $ammo[floor((count($ammo) - 1) * .75)];
            $results['ammo_min'] = $ammo[0];
            $results['ammo_max'] = $ammo[(count($ammo) - 1)];
        }

        if (count($medic) > 0) {
            $results['medic'] = $medic[floor((count($medic) - 1) * .5)];
            $results['medic_lower'] = $medic[floor((count($medic) - 1) * .25)];
            $results['medic_upper'] = $medic[floor((count($medic) - 1) * .75)];
            $results['medic_min'] = $medic[0];
            $results['medic_max'] = $medic[(count($medic) - 1)];
        }

        return $results;
    }

    public function getMedianByPosition($id = null, $team = null, $type = 'mvp_points', $state = null)
    {
        $fields = ['position', $type];

        $conditions = [];

        if (!is_null($id)) {
            $fields[] = 'player_id';
            $conditions[] = ['Scorecard.player_id' => $id];
        }

        if (!is_null($team)) {
            $fields[] = 'team';
            $conditions[] = ['Scorecard.team' => $team];
        }

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Scorecard.center_id' => $state['centerID']];
        }

        if (isset($state['gametype']) && 'all' != $state['gametype']) {
            $conditions[] = ['Scorecard.type' => $state['gametype']];
        }

        if (isset($state['leagueID']) && $state['leagueID'] > 0) {
            $conditions[] = ['Scorecard.event_id' => $state['leagueID']];
        }

        $scores = $this->Scorecard->find('all', [
            'fields' => $fields,
            'conditions' => $conditions,
            'order' => "{$type} ASC",
        ]);

        $commander = [];
        $heavy = [];
        $scout = [];
        $ammo = [];
        $medic = [];

        foreach ($scores as $score) {
            switch ($score['Scorecard']['position']) {
                case 'Commander':
                    $commander[] = $score['Scorecard'][$type];

                    break;
                case 'Heavy Weapons':
                    $heavy[] = $score['Scorecard'][$type];

                    break;
                case 'Scout':
                    $scout[] = $score['Scorecard'][$type];

                    break;
                case 'Ammo Carrier':
                    $ammo[] = $score['Scorecard'][$type];

                    break;
                case 'Medic':
                    $medic[] = $score['Scorecard'][$type];

                    break;
            }
        }

        if (count($commander) > 0) {
            $results['commander'] = $commander[floor((count($commander) - 1) * .5)];
            $results['commander_lower'] = $commander[floor((count($commander) - 1) * .25)];
            $results['commander_upper'] = $commander[floor((count($commander) - 1) * .75)];
            $results['commander_min'] = $commander[0];
            $results['commander_max'] = $commander[(count($commander) - 1)];
            $results['commander_avg'] = array_sum($commander) / count($commander);
        } else {
            $results['commander'] = $results['commander_lower'] = $results['commander_upper'] = $results['commander_min'] = $results['commander_max'] = $results['commander_avg'] = 0;
        }

        if (count($heavy) > 0) {
            $results['heavy'] = $heavy[floor((count($heavy) - 1) * .5)];
            $results['heavy_lower'] = $heavy[floor((count($heavy) - 1) * .25)];
            $results['heavy_upper'] = $heavy[floor((count($heavy) - 1) * .75)];
            $results['heavy_min'] = $heavy[0];
            $results['heavy_max'] = $heavy[(count($heavy) - 1)];
            $results['heavy_avg'] = array_sum($heavy) / count($heavy);
        } else {
            $results['heavy'] = $results['heavy_lower'] = $results['heavy_upper'] = $results['heavy_min'] = $results['heavy_max'] = $results['heavy_avg'] = 0;
        }

        if (count($scout) > 0) {
            $results['scout'] = $scout[floor((count($scout) - 1) * .5)];
            $results['scout_lower'] = $scout[floor((count($scout) - 1) * .25)];
            $results['scout_upper'] = $scout[floor((count($scout) - 1) * .75)];
            $results['scout_min'] = $scout[0];
            $results['scout_max'] = $scout[(count($scout) - 1)];
            $results['scout_avg'] = array_sum($scout) / count($scout);
        } else {
            $results['scout'] = $results['scout_lower'] = $results['scout_upper'] = $results['scout_min'] = $results['scout_max'] = $results['scout_avg'] = 0;
        }

        if (count($ammo) > 0) {
            $results['ammo'] = $ammo[floor((count($ammo) - 1) * .5)];
            $results['ammo_lower'] = $ammo[floor((count($ammo) - 1) * .25)];
            $results['ammo_upper'] = $ammo[floor((count($ammo) - 1) * .75)];
            $results['ammo_min'] = $ammo[0];
            $results['ammo_max'] = $ammo[(count($ammo) - 1)];
            $results['ammo_avg'] = array_sum($ammo) / count($ammo);
        } else {
            $results['ammo'] = $results['ammo_lower'] = $results['ammo_upper'] = $results['ammo_min'] = $results['ammo_max'] = $results['ammo_avg'] = 0;
        }

        if (count($medic) > 0) {
            $results['medic'] = $medic[floor((count($medic) - 1) * .5)];
            $results['medic_lower'] = $medic[floor((count($medic) - 1) * .25)];
            $results['medic_upper'] = $medic[floor((count($medic) - 1) * .75)];
            $results['medic_min'] = $medic[0];
            $results['medic_max'] = $medic[(count($medic) - 1)];
            $results['medic_avg'] = array_sum($medic) / count($medic);
        } else {
            $results['medic'] = $results['medic_lower'] = $results['medic_upper'] = $results['medic_min'] = $results['medic_max'] = $results['medic_avg'] = 0;
        }

        return $results;
    }

    public function getMyTeammates($id, $state = null)
    {
        $results = $this->Scorecard->query("
			select player_name,
			(select count(myTeammates.game_datetime)
			from scorecards myGames
			inner join scorecards myTeammates
			on myGames.game_id = myTeammates.game_id
			and myGames.team = myTeammates.team
			where myTeammates.player_id = players.id
			and myGames.player_id = {$id}
			and myTeammates.player_id != {$id}) as same_team_count,
			(select count(myTeammates.game_datetime)
			from scorecards myGames
			inner join scorecards myTeammates
			on myGames.game_id = myTeammates.game_id
			and myGames.team != myTeammates.team
			where myTeammates.player_id = players.id
			and myGames.player_id = {$id}
			and myTeammates.player_id != {$id}) as other_team_count
			from players
		");

        $teammates = [];

        foreach ($results as $line) {
            if ($line[0]['same_team_count'] + $line[0]['other_team_count'] >= 10) {
                $teammates[$line['players']['player_name']] = [
                    'player_name' => $line['players']['player_name'],
                    'same_team_count' => $line[0]['same_team_count'],
                    'other_team_count' => $line[0]['other_team_count'],
                    'same_team_percent' => ($line[0]['same_team_count'] / ($line[0]['same_team_count'] + $line[0]['other_team_count'])),
                ];
            }
        }

        return $teammates;
    }

    public function linkPlayers($master_id, $target_id)
    {
        //delete duplicate aliases
        $this->query("
        DELETE FROM players_names a
            USING players_names b
            WHERE a.player_name = b.player_name AND b.player_id = {$target_id}
        ");

        //update the player_names table
        $this->PlayersName->updateAll(
            ['PlayersName.player_id' => $master_id],
            ['PlayersName.player_id' => $target_id]
        );
        //update all scorecards with the new id
        $this->Scorecard->updateAll(
            ['Scorecard.player_id' => $master_id],
            ['Scorecard.player_id' => $target_id]
        );

        //Update hits table
        $this->PlayerHits->updateAll(
            ['player_id' => $master_id],
            ['player_id' => $target_id]
        );
        $this->HitPlayer->updateAll(
            ['target_id' => $master_id],
            ['target_id' => $target_id]
        );

        //update delta table
        $this->GameDelta->updateAll(
            ['player_id' => $master_id],
            ['player_id' => $target_id]
        );

        //Update actions table
        $this->GameAction->updateAll(
            ['player_id' => $master_id],
            ['player_id' => $target_id]
        );
        $this->GameActionTarget->updateAll(
            ['target_id' => $master_id],
            ['target_id' => $target_id]
        );

        //delete the old player record
        $this->delete($target_id);
    }

    public function findLinks()
    {
        return $this->query('
        SELECT a.player_id AS master_id,
            a.player_name AS master_name,
            b.player_id AS target_id,
            b.player_name AS target_name
        FROM players_names a
            INNER JOIN players_names b
                ON a.player_name = b.player_name AND a.player_id <> b.player_id
            INNER JOIN players ON a.player_id = players.id
        WHERE players.ipl_id IS NOT NULL
        ');
    }
}
