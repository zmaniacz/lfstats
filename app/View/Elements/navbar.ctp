<nav class="navbar navbar-expand-lg fixed-top bg-primary" data-bs-theme="dark">
    <div class="container-fluid">
        <a class="navbar-brand" href="/scorecards/landing"><i class="material-icons">home</i></a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarSupportedContent">
            <ul class="navbar-nav mr-auto">
                <?php if ('landing' != $this->request->action) { ?>
                    <li class="nav-item">
                        <?php
                        if ($this->Session->read('state.isComp') > 0) {
                            echo $this->Html->link('Standings', ['controller' => 'leagues', 'action' => 'standings'], ['class' => 'nav-link']);
                        } else {
                            echo $this->Html->link('Nightly Stats', ['controller' => 'scorecards', 'action' => 'nightly'], ['class' => 'nav-link']);
                        }
                        ?>
                    </li>
                    <li class="nav-item">
                        <?php echo $this->Html->link('Top Players', ['controller' => 'scorecards', 'action' => 'overall'], ['class' => 'nav-link']); ?>
                    </li>
                    <li class="nav-item">
                        <?php echo $this->Html->link('Game List', ['controller' => 'games', 'action' => 'index'], ['class' => 'nav-link']); ?>
                    </li>
                    <li class="nav-item">
                        <?php echo $this->Html->link('Leader(Loser)boards', ['controller' => 'scorecards', 'action' => 'leaderboards'], ['class' => 'nav-link']); ?>
                    </li>
                    <li class="nav-item">
                        <?php echo $this->Html->link('Center Stats', ['controller' => 'games', 'action' => 'overall'], ['class' => 'nav-link']); ?>
                    </li>
                    <li class="nav-item">
                        <?php
                        if ($this->Session->read('state.isComp') > 0) {
                            echo $this->Html->link('All Star Rankings', ['controller' => 'scorecards', 'action' => 'allstar'], ['class' => 'nav-link']);
                        } else {
                            echo $this->Html->link('All-Center Teams', ['controller' => 'scorecards', 'action' => 'allcenter'], ['class' => 'nav-link']);
                        }
                        ?>
                    </li>
                    <li class="nav-item">
                        <?php echo $this->Html->link('Penalties', ['controller' => 'penalties', 'action' => 'index'], ['class' => 'nav-link']); ?>
                    </li>
                <?php } ?>
                <li class="nav-item">
                    <?php echo $this->Html->link('About SM5', ['controller' => 'pages', 'action' => 'aboutSM5'], ['class' => 'nav-link']); ?>
                </li>
                <li class="nav-item">
                    <?php echo $this->Html->link('Help', ['controller' => 'pages', 'action' => 'help'], ['class' => 'nav-link']); ?>
                </li>
                <?php if ('admin' === AuthComponent::user('role') || ('center_admin' === AuthComponent::user('role') && AuthComponent::user('center') == $this->Session->read('state.centerID'))) { ?>
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarAdminDropdown" role="button" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            Admin
                        </a>
                        <div class="dropdown-menu" aria-labelledby="navbarDropdown">
                            <?php echo $this->Html->link('Upload TDFs', ['controller' => 'uploads', 'action' => 'uploadTdf'], ['class' => 'dropdown-item']); ?>
                            <?php echo $this->Html->link('Import Log', ['controller' => 'uploads', 'action' => 'viewImports'], ['class' => 'dropdown-item']); ?>
                            <div class="dropdown-divider"></div>
                            <?php echo $this->Html->link('Upload PDFs (Retiring Soon)', ['controller' => 'uploads', 'action' => 'index'], ['class' => 'dropdown-item']); ?>
                        </div>
                    </li>
                <?php } ?>
            </ul>
            <form class="form-inline">
                <?php if (AuthComponent::user('id')) { ?>
                    <a class="btn btn-sm btn-info mr-2" href="/users/logout" role="button"><?php echo AuthComponent::user('username'); ?>
                        Logout</a>
                <?php } else { ?>
                    <a class="btn btn-sm btn-success mr-2" href="/users/login" role="button">Login</a>
                <?php } ?>
            </form>
        </div>
    </div>
</nav>