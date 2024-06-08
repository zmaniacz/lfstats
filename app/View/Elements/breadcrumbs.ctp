<div class="btn-group">
    <div class="dropdown">
        <button class="btn btn-outline-primary dropdown-toggle" type="button" id="dropdownMenu1" data-bs-toggle="dropdown">
            <?php echo    Inflector::camelize(($this->Session->read('state.isComp') > 0) ? 'competitive' : $this->Session->read('state.gametype')); ?>
        </button>
        <div class="dropdown-menu">
            <?php echo $this->Html->link('All', [
                'controller' => $this->request->params['controller'],
                'action' => $this->request->params['action'],
                implode(',', $this->request->pass),
                '?' => [
                    'gametype' => 'all',
                    'centerID' => 0,
                    'leagueID' => 0,
                    'isComp' => 0,
                ],
            ], ['class' => 'dropdown-item']); ?>
            <?php echo $this->Html->link('Social', [
                'controller' => $this->request->params['controller'],
                'action' => $this->request->params['action'],
                implode(',', $this->request->pass),
                '?' => [
                    'gametype' => 'social',
                    'centerID' => $this->Session->read('state.centerID'),
                    'leagueID' => 0,
                    'isComp' => 0,
                ],
            ], ['class' => 'dropdown-item']); ?>
            <?php echo $this->Html->link('Competitive', [
                'controller' => $this->request->params['controller'],
                'action' => $this->request->params['action'],
                implode(',', $this->request->pass),
                '?' => [
                    'gametype' => 'league',
                    'centerID' => $this->Session->read('state.centerID'),
                    'leagueID' => $this->Session->read('state.leagueID'),
                    'isComp' => 1,
                ],
            ], ['class' => 'dropdown-item']); ?>
        </div>
    </div>
    <span class="my-auto mx-2"><i class="material-icons">chevron_right</i></span>
    <div class="dropdown">
        <button class="btn btn-outline-primary dropdown-toggle" type="button" id="dropdownMenu2" data-bs-toggle="dropdown">
            <?php
            if ($this->Session->read('state.isComp') > 0 && $this->Session->read('state.leagueID') > 0) {
                echo $leagues[$this->Session->read('state.leagueID')];
            } elseif ($this->Session->read('state.centerID') > 0) {
                echo $centers[$this->Session->read('state.centerID')];
            } else {
                echo 'All Games';
            }
            ?>
        </button>
        <div class="dropdown-menu">
            <?php echo $this->Html->link('All Games', [
                'controller' => $this->request->params['controller'],
                'action' => $this->request->params['action'],
                implode(',', $this->request->pass),
                '?' => [
                    'gametype' => $this->Session->read('state.gametype'),
                    'centerID' => 0,
                    'leagueID' => 0,
                    'isComp' => 0,
                ],
            ], ['class' => 'dropdown-item']); ?>
            <div class="dropdown-divider"></div>
            <?php
            if ('all' == $this->Session->read('state.gametype') || 'social' == $this->Session->read('state.gametype')) {
                echo '<h6 class="dropdown-header">Centers</h6>';
                $sorted_centers = $centers;
                asort($sorted_centers);
                foreach ($sorted_centers as $key => $value) {
                    echo $this->Html->link($value, [
                        'controller' => $this->request->params['controller'],
                        'action' => $this->request->params['action'],
                        implode(',', $this->request->pass),
                        '?' => [
                            'gametype' => $this->Session->read('state.gametype'),
                            'centerID' => $key,
                            'leagueID' => 0,
                            'isComp' => 0,
                        ],
                    ], ['class' => 'dropdown-item']);
                }
            }
            if ('all' == $this->Session->read('state.gametype') || $this->Session->read('state.isComp') > 0) {
                echo '<h6 class="dropdown-header">Competitions</h6>';
                foreach ($league_details as $league) {
                    echo $this->Html->link($league['Event']['name'], [
                        'controller' => $this->request->params['controller'],
                        'action' => $this->request->params['action'],
                        implode(',', $this->request->pass),
                        '?' => [
                            'gametype' => 'league',
                            'centerID' => $league['Event']['center_id'],
                            'leagueID' => $league['Event']['id'],
                            'isComp' => 1,
                        ],
                    ], ['class' => 'dropdown-item']);
                }
            }
            ?>
        </div>
    </div>
</div>