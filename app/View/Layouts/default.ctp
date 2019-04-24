<?php
/**
 *
 *
 * CakePHP(tm) : Rapid Development Framework (http://cakephp.org)
 * Copyright (c) Cake Software Foundation, Inc. (http://cakefoundation.org)
 *
 * Licensed under The MIT License
 * For full copyright and license information, please see the LICENSE.txt
 * Redistributions of files must retain the above copyright notice.
 *
 * @copyright     Copyright (c) Cake Software Foundation, Inc. (http://cakefoundation.org)
 * @link          http://cakephp.org CakePHP(tm) Project
 * @package       app.View.Layouts
 * @since         CakePHP(tm) v 0.10.0.1076
 * @license       http://www.opensource.org/licenses/mit-license.php MIT License
 */
//debug($this->Session->read());
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?= $this->element('head'); ?>
</head>

<body>
    <script>
    $(document).ready(function() {
        Highcharts.setOptions({
            chart: {
                style: {
                    fontFamily: '"Open Sans","Helvetica Neue",Helvetica,Arial,sans-serif'
                }
            }
        });
    });
    </script>
    <div class="container">
        <div id="container">
            <div id="header">
                <?= $this->element('navbar'); ?>
            </div>
            <div id="content">
                <?php echo $this->Session->flash(); ?>
                <?php echo $this->fetch('content'); ?>
                <div class="modal fade" id="mvpModal" tabindex="-1">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header">
                                <button type="button" class="close" data-dismiss="modal"><span
                                        aria-hidden="true">&times;</span></button>
                                <h4 class="modal-title" id="mvpModalLabel">MVP Details</h4>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal fade" id="penaltyModal" tabindex="-1">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header">
                                <button type="button" class="close" data-dismiss="modal"><span
                                        aria-hidden="true">&times;</span></button>
                                <h4 class="modal-title" id="penaltyModalLabel">Penalty Details</h4>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal fade" id="teamPenaltyModal" tabindex="-1">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header">
                                <button type="button" class="close" data-dismiss="modal"><span
                                        aria-hidden="true">&times;</span></button>
                                <h4 class="modal-title" id="penaltyModalLabel">Team Penalty Details</h4>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal fade" id="hitModal" tabindex="-1">
                    <div class="modal-dialog modal-md">
                        <div class="modal-content">
                            <div class="modal-header">
                                <button type="button" class="close" data-dismiss="modal"><span
                                        aria-hidden="true">&times;</span></button>
                                <h4 class="modal-title" id="hitModalLabel">Hit Details</h4>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal fade" id="matchModal" tabindex="-1">
                    <div class="modal-dialog modal-md">
                        <div class="modal-content">
                            <div class="modal-header">
                                <button type="button" class="close" data-dismiss="modal"><span
                                        aria-hidden="true">&times;</span></button>
                                <h4 class="modal-title" id="matchModalLabel">Match Details</h4>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            <div id="footer">
                <h6 class="text-center">
                    <small>
                        Players have shot each other
                        <?=$scorecard_stats[0]['total_hits']; ?>
                        times in
                        <?=$game_stats[0]['total_games']; ?>
                        games with
                        <?=$scorecard_stats[0]['total_scorecards']; ?>
                        individual scorecards.
                    </small>
                </h6>
            </div>
        </div>
    </div>
    <script>
    $(document).ready(function() {
        $.ajax({
            url: 'https://api.twitch.tv/kraken/streams/laserforcetournaments?client_id=5shofd1neum3sel2bzbaskcvyohfgz',
            dataType: 'jsonp',
        }).done(function(channel) {
            if (channel["stream"] == null) {
                $("#twitch_status").append(
                    " <span class=\"badge badge-secondary badge-pill py-1\">Offline</span>"
                );
            } else {
                $("#twitch_status").append(
                    " <span class=\"badge badge-danger py-1\">LIVE</span>");
            }
        });

        //global handlers for the various modals
        $('#penaltyModal').on('show.bs.modal', function(event) {
            var button = $(event.relatedTarget);
            $(this).find(".modal-body").text("Loading...");
            $(this).find(".modal-body").load(button.attr("target"));
        });
        $('#teamPenaltyModal').on('show.bs.modal', function(event) {
            var button = $(event.relatedTarget);
            $(this).find(".modal-body").text("Loading...");
            $(this).find(".modal-body").load(button.attr("target"));
        });
        $('#hitModal').on('show.bs.modal', function(event) {
            var button = $(event.relatedTarget);
            $(this).find(".modal-body").text("Loading...");
            $(this).find(".modal-body").load(button.attr("target"));
        });
        $('#matchModal').on('show.bs.modal', function(event) {
            var button = $(event.relatedTarget);
            $(this).find(".modal-body").text("Loading...");
            $(this).find(".modal-body").load(button.attr("target"));
        });
        $('#mvpModal').on('show.bs.modal', function(event) {
            var button = $(event.relatedTarget);
            $(this).find(".modal-body").text("Loading...");
            $(this).find(".modal-body").load(button.attr("target"));
        });
    });
    </script>
</body>

</html>