<nav class="navbar navbar-expand-lg fixed-top navbar-dark bg-primary">
    <a class="navbar-brand" href="/scorecards/landing"><i class="material-icons">home</i></a>
    <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent">
        <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarSupportedContent">
        <ul class="navbar-nav mr-auto">
            <?php if ($this->request->action != 'landing'): ?>
            <li class="nav-item">
                <?php
                                        if ($this->Session->read('state.isComp') > 0) {
                                            echo $this->Html->link('Standings', array('controller' => 'leagues', 'action' => 'standings'), array('class' => 'nav-link'));
                                        } else {
                                            echo $this->Html->link('Nightly Stats', array('controller' => 'scorecards', 'action' => 'nightly'), array('class' => 'nav-link'));
                                        }
                                    ?>
            </li>
            <li class="nav-item">
                <?= $this->Html->link('Top Players', array('controller' => 'scorecards', 'action' => 'overall'), array('class' => 'nav-link')); ?>
            </li>
            <li class="nav-item">
                <?= $this->Html->link('Game List', array('controller' => 'games', 'action' => 'index'), array('class' => 'nav-link')); ?>
            </li>
            <li class="nav-item">
                <?= $this->Html->link('Leader(Loser)boards', array('controller' => 'scorecards', 'action' => 'leaderboards'), array('class' => 'nav-link')); ?>
            </li>
            <li class="nav-item">
                <?= $this->Html->link('Center Stats', array('controller' => 'games', 'action' => 'overall'), array('class' => 'nav-link')); ?>
            </li>
            <li class="nav-item">
                <?php
                                        if ($this->Session->read('state.isComp') > 0) {
                                            echo $this->Html->link('All Star Rankings', array('controller' => 'scorecards', 'action' => 'allstar'), array('class' => 'nav-link'));
                                        } else {
                                            echo $this->Html->link('All-Center Teams', array('controller' => 'scorecards', 'action' => 'allcenter'), array('class' => 'nav-link'));
                                        }
                                    ?>
            </li>
            <li class="nav-item">
                <?= $this->Html->link('Penalties', array('controller' => 'penalties', 'action' => 'index'), array('class' => 'nav-link')); ?>
            </li>

            <li class="nav-item">
                <?= $this->Html->link('Syracuse 2019', array('controller' => 'leagues', 'action' => 'standings', '?' => array('gametype' => 'league', 'leagueID' => 687, 'centerID' => 8)), array('class' => 'nav-link')); ?>
            </li class="nav-item">
            <?php if (AuthComponent::user('role') === 'admin' || (AuthComponent::user('role') === 'center_admin' && AuthComponent::user('center') == $this->Session->read('state.centerID'))): ?>
            <li class="nav-item">
                <?= $this->Html->link('Upload PDFs', array('controller' => 'uploads', 'action' => 'index'), array('class' => 'nav-link')); ?>
            </li>
            <?php endif; ?>
            <?php endif;?>
            <li class="nav-item">
                <?= $this->Html->link('About SM5', array('controller' => 'pages', 'action' => 'aboutSM5'), array('class' => 'nav-link')); ?>
            </li>
            <li class="nav-item"><a class="nav-link" id="twitch_status"
                    href="https://www.twitch.tv/laserforcetournaments">Twitch</a></li>
        </ul>
        <form class="form-inline">
            <?php if (AuthComponent::user('id')): ?>
            <a class="btn btn-sm btn-info mr-2" href="/users/logout"
                role="button"><?= AuthComponent::user('username') ?>
                Logout</a>
            <?php else: ?>
            <a class="btn btn-sm btn-success mr-2" href="/users/login" role="button">Login</a>
            <?php endif; ?>
        </form>
        </ul>
    </div>
</nav>