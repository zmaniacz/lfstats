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
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <script src='https://cdnjs.cloudflare.com/ajax/libs/jquery/3.3.1/jquery.min.js'></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js"
        integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous">
    </script>
    <script defer src="https://use.fontawesome.com/releases/v5.8.1/js/all.js"
        integrity="sha384-g5uSoOSBd7KkhAMlnQILrecXvzst9TdC09/VM+pjDTCM+1il8RHz5fKANTFFb+gQ" crossorigin="anonymous">
    </script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js"
        integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous">
    </script>
    <script type="text/javascript" src="https://cdn.datatables.net/v/bs4/dt-1.10.18/r-2.2.2/datatables.min.js">
    </script>

    <script defer src='https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js'></script>
    <script defer src='https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/11.0.3/nouislider.min.js'></script>
    <script defer src='https://code.highcharts.com/stock/highstock.js'></script>
    <script defer src='https://code.highcharts.com/stock/highcharts-more.js'></script>
    <script defer src='https://code.highcharts.com/stock/indicators/indicators.js'></script>

    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css"
        integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
    <link rel="stylesheet" type="text/css"
        href="https://cdn.datatables.net/v/bs4/dt-1.10.18/r-2.2.2/datatables.min.css" />
    <?php
        echo $this->Html->css('laserforce');
        echo $this->Html->css('https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/css/toastr.min.css');
        echo $this->Html->css('https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/11.0.3/nouislider.min.css');
    ?>
    <title>
        <?php echo $title_for_layout; ?>
    </title>
</head>

<body>
    <div class="container" id="container">
        <div id="header">
            <nav class="navbar navbar-expand-lg fixed-top navbar-dark bg-primary">
                <a class="navbar-brand" href="/scorecards/landing"><i class="fas fa-home"></i></a>
                <button class="navbar-toggler" type="button" data-toggle="collapse"
                    data-target="#navbarSupportedContent">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarSupportedContent">
                    <ul class="navbar-nav mr-auto">
                        <li class="nav-item">
                            <?= $this->Html->link('About SM5', array('controller' => 'pages', 'action' => 'aboutSM5'), array('class' => 'nav-link')); ?>
                        </li>
                        <li class="nav-item"><a class="nav-link" id="twitch_status"
                                href="https://www.twitch.tv/laserforcetournaments">Twitch</a></li>
                    </ul>
                    <form class="form-inline">
                        <?php if (AuthComponent::user('id')): ?>
                        <a class="btn btn-sm btn-outline-danger mr-2" href="/users/logout"
                            role="button"><?= AuthComponent::user('username') ?>
                            Logout</a>
                        <?php else: ?>
                        <a class="btn btn-sm btn-outline-success mr-2" href="/users/login" role="button">Login</a>
                        <?php endif; ?>
                    </form>
                    </ul>
                </div>
            </nav>
            <div id="content">
                <?php echo $this->Session->flash(); ?>
                <?php echo $this->fetch('content'); ?>
            </div>
            <div id="footer">
                <h6 class="text-center">
                    <small>
                        Players have shot each other <?=$scorecard_stats[0]['total_hits']; ?>
                        times in <?=$game_stats[0]['total_games']; ?>
                        games with <?=$scorecard_stats[0]['total_scorecards']; ?>
                        individual scorecards.
                    </small>
                </h6>
            </div>
        </div>
        <script>
        $(document).ready(function() {
            $.ajax({
                url: 'https://api.twitch.tv/kraken/streams/laserforce_brisbane?client_id=5shofd1neum3sel2bzbaskcvyohfgz',
                dataType: 'jsonp',
                success: function(channel) {
                    if (channel["stream"] == null) {
                        $("#twitch_status").append(
                            " <span class=\"badge badge-secondary\">Offline</span>"
                        );
                    } else {
                        $("#twitch_status").append(
                            " <span class=\"badge badge-danger\">LIVE</span>");
                    }
                },
                error: function() {
                    //request failed
                }
            });
        });
        </script>
</body>

</html>