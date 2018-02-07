<?php
	App::uses('HtmlHelper', 'View/Helper');
	
	class HtmlExtHelper extends HtmlHelper {
		var $helpers = array('Session');
		
		public function url($url = null, $full = false) {
			if(is_array($url) && empty($url['?'])) {
				$querystring = array('?' => array(
										'gametype' => $this->Session->read('state.gametype'),
										'leagueID' => $this->Session->read('state.leagueID'),
										'centerID' => $this->Session->read('state.centerID'),
										'isComp' => $this->Session->read('state.isComp')
				));
				$url = $url + $querystring;
			}

			return parent::url($url, $full);
		}
	}