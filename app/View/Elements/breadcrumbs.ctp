<div class="row">
    <div class="dropdown">
        <button class="btn btn-outline-primary dropdown-toggle" type="button" id="dropdownMenu1" data-toggle="dropdown">
            <?=	Inflector::camelize(($this->Session->read('state.isComp') > 0) ? 'competitive' : $this->Session->read('state.gametype')); ?></button>
        <div class="dropdown-menu">
            <?= $this->Html->link('All', array(
        'controller' => $this->request->params['controller'],
        'action' => $this->request->params['action'],
        implode(",", $this->request->pass),
        '?' => array(
            'gametype' => 'all',
            'centerID' => 0,
            'leagueID' => 0,
            'isComp' => 0
        )), array('class' => 'dropdown-item')); ?>
            <?= $this->Html->link('Social', array(
        'controller' => $this->request->params['controller'],
        'action' => $this->request->params['action'],
        implode(",", $this->request->pass),
        '?' => array(
            'gametype' => 'social',
            'centerID' => $this->Session->read('state.centerID'),
            'leagueID' => 0,
            'isComp' => 0
        )), array('class' => 'dropdown-item')); ?>
            <?= $this->Html->link('Competitive', array(
        'controller' => $this->request->params['controller'],
        'action' => $this->request->params['action'],
        implode(",", $this->request->pass),
        '?' => array(
            'gametype' => 'league',
            'centerID' => $this->Session->read('state.centerID'),
            'leagueID' => $this->Session->read('state.leagueID'),
            'isComp' => 1
        )), array('class' => 'dropdown-item')); ?>
        </div>
    </div>
    <span class="my-auto mx-2"><i class="fas fa-angle-double-right"></i></span>
    <div class="dropdown">
        <button class="btn btn-outline-primary dropdown-toggle" type="button" id="dropdownMenu2" data-toggle="dropdown"><?php
            if ($this->Session->read('state.isComp') > 0) {
                echo $leagues[$this->Session->read('state.leagueID')];
            } elseif ($this->Session->read('state.centerID') > 0) {
                echo $centers[$this->Session->read('state.centerID')];
            } else {
                echo 'All Games';
            }
        ?></button>
        <div class="dropdown-menu">
            <?= $this->Html->link('All Games', array(
        'controller' => $this->request->params['controller'],
        'action' => $this->request->params['action'],
        implode(",", $this->request->pass),
        '?' => array(
            'gametype' => $this->Session->read('state.gametype'),
            'centerID' => 0,
            'leagueID' => 0,
            'isComp' => 0
        )), array('class' => 'dropdown-item')); ?>
            <div class="dropdown-divider"></div>
            <?php
            if ($this->Session->read('state.gametype') == 'all' || $this->Session->read('state.gametype') == 'social') {
                echo "<h6 class=\"dropdown-header\">Centers</h6>";
                $sorted_centers = $centers;
                asort($sorted_centers);
                foreach ($sorted_centers as $key => $value) {
                    echo $this->Html->link($value, array(
                        'controller' => $this->request->params['controller'],
                        'action' => $this->request->params['action'],
                        implode(",", $this->request->pass),
                        '?' => array(
                            'gametype' => $this->Session->read('state.gametype'),
                            'centerID' => $key,
                            'leagueID' => 0,
                            'isComp' => 0
                        )
                    ), array('class' => 'dropdown-item'));
                }
            }
            if ($this->Session->read('state.gametype') == 'all' || $this->Session->read('state.isComp') > 0) {
                echo "<h6 class=\"dropdown-header\">Competitions</h6>";
                foreach ($league_details as $league) {
                    echo $this->Html->link($league['Event']['name'], array(
                        'controller' => $this->request->params['controller'],
                        'action' => $this->request->params['action'],
                        implode(",", $this->request->pass),
                        '?' => array(
                            'gametype' => 'league',
                            'centerID' => $league['Event']['center_id'],
                            'leagueID' => $league['Event']['id'],
                            'isComp' => 1
                        )
                    ), array('class' => 'dropdown-item'));
                }
            }
        ?>
        </div>
    </div>
</div>