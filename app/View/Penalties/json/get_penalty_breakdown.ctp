<?php
    $list = array();
    foreach ($penalties as $penalty) {
        $list[$penalty['Penalty']['type']][] = $penalty['Penalty'];
    }

    debug($list);