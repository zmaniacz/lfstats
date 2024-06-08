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
<!doctype html>
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
                <?php echo $this->Flash->render(); ?>
                <?php echo $this->fetch('content'); ?>
                <div class="modal" id="genericModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h4 class="modal-title"></h4>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script>
        $(document).ready(function() {
            /*$.ajax({
                url: 'https://api.twitch.tv/helix/streams?user_login=laserforcetournaments',
                headers: {
                    'Client-ID': '5shofd1neum3sel2bzbaskcvyohfgz'
                },
            }).done(function(channel) {
                if (typeof channel["data"] != "undefined" && channel["data"] != null && channel["data"]
                    .length != null && channel["data"].length > 0) {
                    $("#twitch_status").append(
                        " <span class=\"badge badge-danger py-1\">LIVE</span>");
                } else {

                    $("#twitch_status").append(
                        " <span class=\"badge badge-secondary badge-pill py-1\">Offline</span>"
                    );
                }
            });*/

            $('#genericModal').on('show.bs.modal', function(event) {
                var button = $(event.relatedTarget);
                $(this).find(".modal-dialog").removeClass("modal-sm modal-lg modal-xl");
                $(this).find(".modal-dialog").addClass(button.data("modalsize"));
                $(this).find(".modal-title").text(button.data("title"));
                $(this).find(".modal-body").text("Loading...");
                $(this).find(".modal-body").load(button.attr("target"));
            }).modal('handleUpdate');
        });
    </script>
</body>

</html>