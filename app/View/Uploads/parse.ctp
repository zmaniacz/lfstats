<div id="status"><img src="http://lfstats.com/img/lfstats_loading.gif" /></div>
<script>
	$(document).ready(function() {
		const params = new URLSearchParams(location.search);
		let selectedEvent = JSON.stringify(<?= json_encode($selectedEvent, JSON_NUMERIC_CHECK,JSON_FORCE_OBJECT); ?>);
		params.set('selectedEvent', selectedEvent);
		var checkStatus = function() {
			$.getJSON("<?php echo $this->Html->url(array('action' => 'checkPid', $pid, 'ext' => 'json')); ?>", function(data) {
				if (data.alive) {
					setTimeout(checkStatus, 1000);
				} else {
					let importButton = `<a class="btn btn-primary btn-lg" href="/uploads/parseCSV?${params.toString()}">Import</a>`;
					$("#status").empty().append(importButton);

				}
			});
		};

		checkStatus();
	});
</script>