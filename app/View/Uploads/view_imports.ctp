<?php echo $this->element('breadcrumbs'); ?>
<hr>
<h4 class="my-4">
    Game Import Status
</h4>
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
    let importTable = $('#import_list').DataTable({
        processing: true,
        paging: true,
        info: true,
        searching: true,
        data: data,
        order: [
            [2, "desc"]
        ],
        columns: [{
                data: "id"
            },
            {
                data: "filename"   
            },
            {
                data: "job_start"
            },
            {
                data: "job_end"
            },
            {
                data: "status"
            },
            {
                data: "game_id"
            },
        ]
    });

    function updateImportTable(table) {
        let url =
            "<?= html_entity_decode($this->Html->url(array('controller' => 'uploads', 'action' => 'getImportList', 'ext' => 'json'))); ?>"
        table.ajax.url(url).load();

        setTimeout(function() {
            updateImportTable(table);
        }, 30000)
    }

    updateImportTable(importTable);
});
</script>