<?php

App::uses('AppModel', 'Model');

class Upload extends AppModel
{
    public $useTable = 'game_imports';

    public $belongsTo = [
        'Game' => [
            'className' => 'Game',
            'foreignKey' => 'game_id',
        ],
    ];

    public function getImportList($limit)
    {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Upload.center_id' => $state['centerID']];
        }

        return $this->find('all', [
            'contain' => ['Game'],
            'conditions' => $conditions,
            'order' => 'Upload.job_start DESC NULLS LAST',
            'limit' => $limit,
        ]);
    }
}
