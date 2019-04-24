<ul class="breadcrumb">
    <li class="dropdown">
        <button class="btn btn-default dropdown-toggle" type="button" id="dropdownMenu1" data-toggle="dropdown">
            <?=	Inflector::camelize(($this->Session->read('state.isComp') > 0) ? 'competitive' : $this->Session->read('state.gametype')); ?>
            <span class="caret"></span></button>
        <ul class="dropdown-menu">
            <li>
                <?= $this->Html->link('All', array(
                    'controller' => $this->request->params['controller'],
                    'action' => $this->request->params['action'],
                    implode(",", $this->request->pass),
                    '?' => array(
                        'gametype' => 'all',
                        'centerID' => 0,
                        'leagueID' => 0,
                        'isComp' => 0
                    ))); ?>
            </li>
            <li>
                <?= $this->Html->link('Social', array(
                    'controller' => $this->request->params['controller'],
                    'action' => $this->request->params['action'],
                    implode(",", $this->request->pass),
                    '?' => array(
                        'gametype' => 'social',
                        'centerID' => $this->Session->read('state.centerID'),
                        'leagueID' => 0,
                        'isComp' => 0
                    ))); ?>
            </li>
            <li>
                <?= $this->Html->link('Competitive', array(
                    'controller' => $this->request->params['controller'],
                    'action' => $this->request->params['action'],
                    implode(",", $this->request->pass),
                    '?' => array(
                        'gametype' => 'league',
                        'centerID' => $this->Session->read('state.centerID'),
                        'leagueID' => $this->Session->read('state.leagueID'),
                        'isComp' => 1
                    ))); ?>
            </li>
        </ul>
    </li>
    <li class="dropdown">
        <button class="btn btn-default dropdown-toggle" type="button" id="dropdownMenu2" data-toggle="dropdown">
            <?php
                if ($this->Session->read('state.isComp') > 0) {
                    echo $leagues[$this->Session->read('state.leagueID')];
                } elseif ($this->Session->read('state.centerID') > 0) {
                    echo $centers[$this->Session->read('state.centerID')];
                } else {
                    echo 'All Games';
                }
            ?>
            <span class="caret"></span>
        </button>
        <ul class="dropdown-menu">
            <li>
                <?= $this->Html->link('All Games', array(
                    'controller' => $this->request->params['controller'],
                    'action' => $this->request->params['action'],
                    implode(",", $this->request->pass),
                    '?' => array(
                        'gametype' => $this->Session->read('state.gametype'),
                        'centerID' => 0,
                        'leagueID' => 0,
                        'isComp' => 0
                    ))); ?>
            </li>
            <li class="divider"></li>
            <?php
                if ($this->Session->read('state.gametype') == 'all' || $this->Session->read('state.gametype') == 'social') {
                    echo "<li class=\"dropdown-header\">Centers</li>";
                    $sorted_centers = $centers;
                    asort($sorted_centers);
                    foreach ($sorted_centers as $key => $value) {
                        echo "<li>".$this->Html->link($value, array(
                            'controller' => $this->request->params['controller'],
                            'action' => $this->request->params['action'],
                            implode(",", $this->request->pass),
                            '?' => array(
                                'gametype' => $this->Session->read('state.gametype'),
                                'centerID' => $key,
                                'leagueID' => 0,
                                'isComp' => 0
                            )
                        ))."</li>";
                    }
                }
                if ($this->Session->read('state.gametype') == 'all' || $this->Session->read('state.isComp') > 0) {
                    echo "<li class=\"dropdown-header\">Competitions</li>";
                    foreach ($league_details as $league) {
                        echo "<li>".$this->Html->link($league['Event']['name'], array(
                            'controller' => $this->request->params['controller'],
                            'action' => $this->request->params['action'],
                            implode(",", $this->request->pass),
                            '?' => array(
                                'gametype' => 'league',
                                'centerID' => $league['Event']['center_id'],
                                'leagueID' => $league['Event']['id'],
                                'isComp' => 1
                            )
                        ))."</li>";
                    }
                }
            ?>
        </ul>
    </li>
</ul>