<?php

App::uses('ConnectionManager', 'Model', 'Folder');

class MigrateShell extends AppShell {
    public $uses = array('Team','Game','Scorecard','Event','Center');

    public function main() {
        $this->out('choose a step');
    }

    public function do() {
        $db = ConnectionManager::getDataSource('default');

        $this->out('Rename teams table and foreign keys');
        $db->rawQuery("ALTER TABLE `teams` RENAME TO  `event_teams`");
        $db->rawQuery("ALTER TABLE `event_teams` DROP FOREIGN KEY `fk_teams_leagues_league_id`");
        $db->rawQuery("ALTER TABLE `event_teams` DROP INDEX `league_id`");
        $db->rawQuery("ALTER TABLE `event_teams` CHANGE COLUMN `league_id` `event_id` INT(11) NOT NULL");

        $this->out('rename leagues table to events');
        $db->rawQuery("ALTER TABLE `leagues` DROP FOREIGN KEY `fk_leagues_centers_center_id`");
        $db->rawQuery("ALTER TABLE `leagues` 
                        ADD COLUMN `is_comp` TINYINT(1) NOT NULL DEFAULT 0 AFTER `type`, 
                        RENAME TO  `events`");
        $db->rawQuery("ALTER TABLE `events` 
                        ADD CONSTRAINT `fk_events_centers_center_id`
                            FOREIGN KEY (`center_id`)
                            REFERENCES `centers` (`id`)");
        
        $this->out('fix event_teams foreign keys');
        $db->rawQuery("ALTER TABLE `event_teams` 
                        ADD CONSTRAINT `fk_event_teams_events_event_id`
                            FOREIGN KEY (`event_id`)
                            REFERENCES `events` (`id`)");
        
        $this->out('drop player_teams table -- unused');
        $db->rawQuery("DROP TABLE `players_teams`;");

        $this->out('gotta fix the Rounds table too');
        $db->rawQuery("ALTER TABLE `rounds` DROP FOREIGN KEY `fk_rounds_leagues_league_id`");
        $db->rawQuery("ALTER TABLE `rounds` 
                        CHANGE COLUMN `league_id` `event_id` INT(11) NULL DEFAULT NULL ,
                        ADD INDEX `fk_rounds_events_event_id_idx` (`event_id` ASC),
                        DROP INDEX `league_id`");
        $db->rawQuery("ALTER TABLE `rounds` 
                        ADD CONSTRAINT `fk_rounds_events_event_id`
                            FOREIGN KEY (`event_id`)
                            REFERENCES `events` (`id`)
                            ON DELETE NO ACTION
                            ON UPDATE NO ACTION");

        /*$this->out('create the new teams table');
        $db->rawQuery("CREATE TABLE `teams` (
                        `id` int(11) NOT NULL AUTO_INCREMENT,
                        `color` varchar(255) COLLATE utf8_unicode_ci NOT NULL,
                        `raw_score` int(11) NOT NULL DEFAULT '0',
                        `bonus_score` int(11) NOT NULL DEFAULT '0',
                        `penalty_score` int(11) NOT NULL DEFAULT '0',
                        `eliminated` tinyint(1) NOT NULL DEFAULT '0',
                        `eliminated_opponent` tinyint(1) NOT NULL DEFAULT '0',
                        `winner` tinyint(1) NOT NULL DEFAULT '0',
                        `game_id` int(11) NOT NULL,
                        `event_team_id` int(11) DEFAULT NULL,
                        `created` datetime NULL DEFAULT NULL,
                        `modified` datetime NULL DEFAULT NULL,
                        PRIMARY KEY (`id`),
                        KEY `game_id_idx` (`game_id`),
                        KEY `event_team_id_idx` (`event_team_id`), 
                        CONSTRAINT `fk_teams_games_game_id` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`),
                        CONSTRAINT `fk_teams_event_teams_event_team_id` FOREIGN KEY (`event_team_id`) REFERENCES `event_teams` (`id`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci");*/


        /*$this->out('create teams records based on existing game records');
        $this->out('select all the games with their red team data');
        $games = $this->Game->find('all');
        foreach($games as $game) {
            $red_team = array(
                    'color' => 'red',
                    'raw_score' => $game['Game']['red_score'],
                    'eliminated' => $game['Game']['red_eliminated'],
                    'eliminated_opponent' => $game['Game']['green_eliminated'],
                    'game_id' => $game['Game']['id'],
                    'event_team_id' => $game['Game']['red_team_id']
            );
            $green_team = array(
                    'color' => 'green',
                    'raw_score' => $game['Game']['green_score'],
                    'eliminated' => $game['Game']['green_eliminated'],
                    'eliminated_opponent' => $game['Game']['red_eliminated'],
                    'game_id' => $game['Game']['id'],
                    'event_team_id' => $game['Game']['green_team_id']
            );

            if($game['Game']['winner'] == 'red') {
                $red_team['winner'] = 1;
            } else {
                $green_team['winner'] = 1;
            }

            $this->Team->saveMany(array($red_team,$green_team));
            $this->Team->clear();
        }

        $this->out('add team_id fk to scorecards');
        $db->rawQuery("ALTER TABLE `scorecards` 
                        ADD COLUMN `team_id` INT(11) NULL DEFAULT NULL AFTER `league_id`");
        $db->rawQuery("ALTER TABLE `scorecards` 
                        ADD INDEX `team_id_fk_idx` (`team_id`)");
        $db->rawQuery("ALTER TABLE `scorecards` 
                        ADD CONSTRAINT `fk_scorecards_teams_team_id`
                            FOREIGN KEY (`team_id`)
                            REFERENCES `teams` (`id`)");

        $this->out('link scorecards to teams instead of games');
        $scorecards = $this->Scorecard->find('all', array('fields' => array('id', 'team', 'game_id', 'team_id')));
        $games = $this->Game->find('all', array(
            'fields' => array('Game.id'),
			'contain' => array(
                'Team' =>array(
                    'id',
                    'color'
                )
            )
        ));

        $results = array();
        array_map(function($n) use (&$results) {
            $results[$n['Game']['id']] = array(
                $n['Team'][0]['color'] => $n['Team'][0]['id'],
                $n['Team'][1]['color'] => $n['Team'][1]['id']
            );
            return null;
        }, $games);

        foreach($scorecards as $scorecard) {
            $scorecard['Scorecard']['team_id'] = $results[$scorecard['Scorecard']['game_id']][$scorecard['Scorecard']['team']];
            $this->Scorecard->save($scorecard);
            $this->Scorecard->clear();
        }*/

        $this->out('alter the games table');
        $db = ConnectionManager::getDataSource('default');
        
        $db->rawQuery("ALTER TABLE `games` 
                        DROP FOREIGN KEY `fk_games_centers_center_id`,
                        DROP FOREIGN KEY `fk_games_leagues_league_id`");
        
        $db->rawQuery("ALTER TABLE `games` 
                        DROP COLUMN `green_team_name`,
                        DROP COLUMN `red_team_name`,
                        CHANGE COLUMN `center_id` `center_id` INT(11) NOT NULL ,
                        CHANGE COLUMN `league_id` `event_id` INT(11) NULL DEFAULT NULL,
                        ADD INDEX `fk_games_events_event_id_idx` (`event_id` ASC)");
        
        $db->rawQuery("ALTER TABLE `games` 
                        ADD CONSTRAINT `fk_games_centers_center_id`
                            FOREIGN KEY (`center_id`)
                            REFERENCES `centers` (`id`)
                            ON DELETE NO ACTION
                            ON UPDATE NO ACTION,
                        ADD CONSTRAINT `fk_games_events_event_id`
                            FOREIGN KEY (`event_id`)
                            REFERENCES `events` (`id`)
                            ON DELETE NO ACTION
                            ON UPDATE NO ACTION");

        $db->rawQuery("ALTER TABLE `scorecards` DROP FOREIGN KEY `fk_scorecards_leagues_league_id`");
        $db->rawQuery("ALTER TABLE `scorecards`
                        CHANGE COLUMN `league_id` `event_id` INT(11) NULL DEFAULT NULL, 
                        DROP INDEX `league_id`");
        $db->rawQuery("ALTER TABLE `scorecards` 
                        ADD CONSTRAINT `fk_scorecards_events_event_id`
                            FOREIGN KEY (`event_id`)
                            REFERENCES `events` (`id`)
                            ON DELETE NO ACTION
                            ON UPDATE NO ACTION");
    }

    function do2() {
        $db = ConnectionManager::getDataSource('default');
        
        $this->out('recalc all game winners');
        $games = $this->Game->find('all', array(
            'fields' => array('id')
        ));

        foreach($games as $game) {
            $this->Game->updateGameWinner($game['Game']['id']);
        }

        $this->out('create and populate events');
        $events = $this->Event->find('all');
        foreach($events as $event) {
            $event['Event']['is_comp'] = ($event['Event']['type'] == 'league' || $event['Event']['type'] == 'tournament') ? 1 : 0;
            $this->Event->save($event);
            $this->Event->clear();
        }

        $centers = $this->Center->find('all');
        foreach($centers as $center) {
            $games = $this->Game->find('all', array(
                'conditions' => array(
                    'event_id' => null,
                    'center_id' => $center['Center']['id']
                ),
                'order' => 'game_datetime ASC'
            ));

            $current_date = new DateTime('1975-01-01');
            $current_event = null;

            foreach($games as $game) {
                $diff = date_diff($current_date, date_create($game['Game']['game_datetime']));

                if ($diff->format('%a') > 0) {
                    // new day, save off the previous event and start a new one
                    $current_date = new DateTime($game['Game']['game_datetime']);

                    $current_event = array(
                        'name' => 'Socials '.$current_date->format('Y-m-d'),
                        'type' => 'social',
                        'is_comp' => 0,
                        'center_id' => $center['Center']['id']
                    );
                    $this->Event->create($current_event);
                    $this->Event->save();
                }

                $game['Game']['event_id'] = $this->Event->id;
                $this->Game->save($game);
                $this->Game->clear();
            }
        }

        /*$db->rawQuery("ALTER TABLE `scorecards`
                        CHANGE COLUMN `team` `color` VARCHAR(50) CHARACTER SET 'utf8' NOT NULL
        ");*/
    }

    public function views() {
        $db = ConnectionManager::getDataSource('default');

        $db->rawQuery("CREATE OR REPLACE
                        ALGORITHM = UNDEFINED 
                        DEFINER = `dbo_redial`@`%` 
                        SQL SECURITY DEFINER
                    VIEW `league_games` AS
                        SELECT 
                            `Event`.`id` AS `event_id`,
                            `Round`.`id` AS `round_id`,
                            `Round`.`round` AS `round_number`,
                            `Round`.`is_finals` AS `is_finals`,
                            `Match`.`id` AS `match_id`,
                            `Match`.`match` AS `match_number`,
                            `Game`.`id` AS `game_id`,
                            `Game`.`league_game` AS `game_number`
                        FROM
                            (((`events` `Event`
                            JOIN `rounds` `Round` ON ((`Round`.`event_id` = `Event`.`id`)))
                            JOIN `matches` `Match` ON ((`Match`.`round_id` = `Round`.`id`)))
                            JOIN `games` `Game` ON ((`Game`.`match_id` = `Match`.`id`)))
                        ORDER BY `Event`.`id` , `Round`.`round` , `Match`.`match` , `Game`.`league_game`");

        $db->rawQuery("CREATE 
                        ALGORITHM = UNDEFINED 
                        DEFINER = `dbo_redial`@`%` 
                        SQL SECURITY DEFINER
                    VIEW `game_results` AS
                        SELECT 
                            `scorecards`.`game_datetime` AS `game_datetime`,
                            `scorecards`.`player_id` AS `player_id`,
                            `scorecards`.`id` AS `scorecard_id`,
                            `games`.`id` AS `game_id`,
                            `games`.`type` AS `type`,
                            `games`.`center_id` AS `center_id`,
                            `games`.`event_id` AS `event_id`,
                            (CASE (`scorecards`.`team` = `games`.`winner`)
                                WHEN 1 THEN 'W'
                                ELSE 'L'
                            END) AS `result`,
                            (CASE (`scorecards`.`team` = `games`.`winner`)
                                WHEN 1 THEN 1
                                ELSE 0
                            END) AS `won`
                        FROM
                            (`scorecards`
                            JOIN `games` ON ((`scorecards`.`game_id` = `games`.`id`)))");

        //create the vGames view
        /*
        $db->rawQuery("CREATE OR REPLACE
                        ALGORITHM = UNDEFINED 
                        DEFINER = `dbo_redial`@`%` 
                        SQL SECURITY DEFINER
                    VIEW `v_games` AS
                    SELECT 
                        `games`.`id` AS `id`,
                        `games`.`game_name` AS `game_name`,
                        `games`.`game_description` AS `game_description`,
                        `games`.`game_datetime` AS `game_datetime`,
                        `green_team`.`event_team_id` AS `green_team_id`,
                        `green_team`.`name` AS `green_team_name`,
                        `green_team`.`raw_score` AS `green_score`,
                        (`green_team`.`bonus_score` + `green_team`.`penalty_score`) AS `green_adj`,
                        `green_team`.`eliminated` AS `green_eliminated`,
                        `red_team`.`event_team_id` AS `red_team_id`,
                        `red_team`.`name` AS `red_team_name`,
                        `red_team`.`raw_score` AS `red_score`,
                        (`red_team`.`bonus_score` + `red_team`.`penalty_score`) AS `red_adj`,
                        `red_team`.`eliminated` AS `red_eliminated`,
                        `games`.`winner` AS `winner`,
                        `games`.`type` AS `type`,
                        `games`.`league_round` AS `league_round`,
                        `games`.`league_match` AS `league_match`,
                        `games`.`league_game` AS `league_game`,
                        `games`.`pdf_id` AS `pdf_id`,
                        `games`.`center_id` AS `center_id`,
                        `games`.`event_id` AS `league_id`,
                        `games`.`match_id` AS `match_id`,
                        `games`.`created` AS `created`,
                        `games`.`modified` AS `modified`
                    FROM
                        ((`games`
                        LEFT JOIN (SELECT 
                            `teams`.`id` AS `id`,
                                `teams`.`color` AS `color`,
                                `teams`.`raw_score` AS `raw_score`,
                                `teams`.`bonus_score` AS `bonus_score`,
                                `teams`.`penalty_score` AS `penalty_score`,
                                `teams`.`eliminated` AS `eliminated`,
                                `teams`.`eliminated_opponent` AS `eliminated_opponent`,
                                `teams`.`game_id` AS `game_id`,
                                `teams`.`event_team_id` AS `event_team_id`,
                                `event_teams`.`name` AS `name`,
                                `teams`.`created` AS `created`,
                                `teams`.`modified` AS `modified`
                        FROM
                            (`teams`
                        LEFT JOIN `event_teams` ON ((`teams`.`event_team_id` = `event_teams`.`id`)))
                        WHERE
                            (`teams`.`color` = 'green')) `green_team` ON ((`games`.`id` = `green_team`.`game_id`)))
                        LEFT JOIN (SELECT 
                            `teams`.`id` AS `id`,
                                `teams`.`color` AS `color`,
                                `teams`.`raw_score` AS `raw_score`,
                                `teams`.`bonus_score` AS `bonus_score`,
                                `teams`.`penalty_score` AS `penalty_score`,
                                `teams`.`eliminated` AS `eliminated`,
                                `teams`.`eliminated_opponent` AS `eliminated_opponent`,
                                `teams`.`game_id` AS `game_id`,
                                `teams`.`event_team_id` AS `event_team_id`,
                                `event_teams`.`name` AS `name`,
                                `teams`.`created` AS `created`,
                                `teams`.`modified` AS `modified`
                        FROM
                            (`teams`
                        LEFT JOIN `event_teams` ON ((`teams`.`event_team_id` = `event_teams`.`id`)))
                        WHERE
                            (`teams`.`color` = 'red')) `red_team` ON ((`games`.`id` = `red_team`.`game_id`)))");

        $db->rawQuery("CREATE OR REPLACE
                        ALGORITHM = UNDEFINED 
                        DEFINER = `dbo_redial`@`%` 
                        SQL SECURITY DEFINER
                        VIEW `v_leagues` AS
                        SELECT 
                            `events`.`id`,
                            `events`.`name`,
                            `events`.`description`,
                            `events`.`type`,
                            `events`.`is_comp`,
                            `events`.`center_id`,
                            `events`.`challonge_id`,
                            `events`.`challonge_link`,
                            `events`.`created` AS `created`,
                            `events`.`modified` AS `modified`
                        FROM
                            `events`
                        WHERE
                            `events`.`is_comp` = TRUE");

        $db->rawQuery("CREATE OR REPLACE 
                            ALGORITHM = UNDEFINED 
                            DEFINER = `dbo_redial`@`%` 
                            SQL SECURITY DEFINER
                        VIEW `v_teams` AS
                            SELECT 
                                `event_teams`.`id`,
                                `event_teams`.`name`,
                                `event_teams`.`points`,
                                `event_teams`.`country_code`,
                                `event_teams`.`event_id` AS `league_id`,
                                `event_teams`.`challonge_id`,
                                `event_teams`.`created` AS `created`,
                                `event_teams`.`modified` AS `modified`
                            FROM
                                `event_teams`");

        $db->rawQuery("CREATE OR REPLACE 
                        ALGORITHM = UNDEFINED 
                        DEFINER = `dbo_redial`@`%` 
                        SQL SECURITY DEFINER
                        VIEW `v_rounds` AS
                        SELECT 
                            `rounds`.`id`,
                            `rounds`.`round`,
                            `rounds`.`is_finals`,
                            `rounds`.`event_id` AS `league_id`,
                            `rounds`.`created` AS `created`,
                            `rounds`.`modified` AS `modified`
                        FROM
                            `rounds`");

        $db->rawQuery("CREATE OR REPLACE 
                        ALGORITHM = UNDEFINED 
                        DEFINER = `dbo_redial`@`%` 
                        SQL SECURITY DEFINER
                    VIEW `v_scorecards` AS
                        SELECT 
                            `scorecards`.`id`,
                            `scorecards`.`player_name`,
                            `scorecards`.`game_datetime`,
                            `scorecards`.`color` AS `team`,
                            `scorecards`.`position`,
                            `scorecards`.`shots_hit`,
                            `scorecards`.`shots_fired`,
                            `scorecards`.`times_zapped`,
                            `scorecards`.`times_missiled`,
                            `scorecards`.`missile_hits`,
                            `scorecards`.`nukes_activated`,
                            `scorecards`.`nukes_detonated`,
                            `scorecards`.`nukes_canceled`,
                            `scorecards`.`medic_hits`,
                            `scorecards`.`own_medic_hits`,
                            `scorecards`.`medic_nukes`,
                            `scorecards`.`scout_rapid`,
                            `scorecards`.`life_boost`,
                            `scorecards`.`ammo_boost`,
                            `scorecards`.`lives_left`,
                            `scorecards`.`score`,
                            `scorecards`.`shots_left`,
                            `scorecards`.`penalties`,
                            `scorecards`.`shot_3hit`,
                            `scorecards`.`elim_other_team`,
                            `scorecards`.`team_elim`,
                            `scorecards`.`own_nuke_cancels`,
                            `scorecards`.`shot_opponent`,
                            `scorecards`.`shot_team`,
                            `scorecards`.`missiled_opponent`,
                            `scorecards`.`missiled_team`,
                            `scorecards`.`resupplies`,
                            `scorecards`.`rank`,
                            `scorecards`.`bases_destroyed`,
                            `scorecards`.`accuracy`,
                            `scorecards`.`mvp_points`,
                            `scorecards`.`sp_earned`,
                            `scorecards`.`sp_spent`,
                            `scorecards`.`game_id`,
                            `scorecards`.`type`,
                            `scorecards`.`is_sub`,
                            `scorecards`.`player_id`,
                            `scorecards`.`center_id`,
                            `scorecards`.`pdf_id`,
                            (CASE (`events`.`is_comp` = 1)
                                WHEN 1 THEN `events`.`id`
                                ELSE NULL
                            END) AS `league_id`,
                            `scorecards`.`created`,
                            `scorecards`.`modified`
                        FROM
                            `scorecards`
                                LEFT JOIN
                            `teams` ON (`scorecards`.`team_id` = `teams`.`id`)
                                LEFT JOIN
                            `games` ON (`teams`.`game_id` = `games`.`id`)
                                LEFT JOIN
                            `events` ON (`games`.`event_id` = `events`.`id`)");

        $db->rawQuery("CREATE OR REPLACE
        ALGORITHM = UNDEFINED 
        DEFINER = `dbo_redial`@`%` 
        SQL SECURITY DEFINER
        VIEW `v_league_games` AS
        SELECT 
            `Event`.`id` AS `league_id`,
            `Round`.`id` AS `round_id`,
            `Round`.`round` AS `round_number`,
            `Round`.`is_finals` AS `is_finals`,
            `Match`.`id` AS `match_id`,
            `Match`.`match` AS `match_number`,
            `Game`.`id` AS `game_id`,
            `Game`.`league_game` AS `game_number`
        FROM
            (((`events` `Event`
            JOIN `rounds` `Round` ON ((`Round`.`event_id` = `Event`.`id`)))
            JOIN `matches` `Match` ON ((`Match`.`round_id` = `Round`.`id`)))
            JOIN `games` `Game` ON ((`Game`.`match_id` = `Match`.`id`)))
        WHERE
            `Event`.`is_comp` = 1
        ORDER BY `Event`.`id` , `Round`.`round` , `Match`.`match` , `Game`.`league_game`");*/
    }
}