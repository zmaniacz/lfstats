<?php

    echo $this->Html->script('https://cdn.jsdelivr.net/npm/select2@4.0.12/dist/js/select2.min.js', ['inline' => false]);
    echo $this->Html->css('https://cdn.jsdelivr.net/npm/select2@4.0.12/dist/css/select2.min.css', ['inline' => false]);
?>
<hr>
<h4 class="my-4">
    Game Import Queue
</h4>
<div class="card">
  <div class="card-body">
    Use this page to assign imported games to an event.
    <ol>
        <li>Choose to either create a new social event or add games to an existing event</li>
        <li>Check any games you want to add. Click the game name to get a quick preview of the game.</li>
        <li>Click Apply</li>
    </ol>
  </div>
</div>
<hr>
<select class="js-example-basic-single" name="state">
  <option value="AL">Alabama</option>

  <option value="WY">Wyoming</option>
</select>
<table class="table table-striped table-bordered table-hover table-sm nowrap" id="import_list">
    <thead>
        <th>Job ID</th>
        <th>Filename</th>
        <th>Start</th>
        <th>End</th>
        <th>Status</th>
        <th>Game</th>
    </thead>
</table>
<script>
$(document).ready(function() {
    $('.js-example-basic-single').select2();
});
</script>