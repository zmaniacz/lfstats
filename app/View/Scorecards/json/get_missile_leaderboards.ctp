<?php
    foreach ($data as &$datum) {
        $datum['Scorecard'] = array_merge($datum['Scorecard'], $datum[0]);
    }
    echo json_encode(compact('data'), JSON_NUMERIC_CHECK);