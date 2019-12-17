<?php
App::uses('AppModel', 'Model');

class Upload extends AppModel {
    public $useTable = 'game_imports';

    public function getImportList($limit) {
        $conditions = [];

        if (isset($state['centerID']) && $state['centerID'] > 0) {
            $conditions[] = ['Upload.center_id' => $state['centerID']];
        }

        return $this->find('all',[
            'conditions' => $conditions,
            'limit' => $limit
        ]);
    }
}
?>