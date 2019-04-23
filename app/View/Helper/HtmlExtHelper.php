<?php
    App::uses('HtmlHelper', 'View/Helper');
    
    class HtmlExtHelper extends HtmlHelper
    {
        public $helpers = array('Session');
        
        public function url($url = null, $full = false)
        {
            if (is_array($url) && empty($url['?'])) {
                $querystring = array('?' => $this->request->query);
                $url = $url + $querystring;
            }

            return parent::url($url, $full);
        }
    }