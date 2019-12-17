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
    const params = new URLSearchParams(location.search);

    let importTable = $('#import_list').DataTable({
        processing: true,
        paging: true,
        info: true,
        searching: true,
        order: [
            [2, "desc"]
        ],
        columns: [{
                data: "Upload.id"
            },
            {
                data: "Upload.filename"   
            },
            {
                data: "Upload.job_start"
            },
            {
                data: "Upload.job_end"
            },
            {
                data: "Upload.status"
            },
            {
                data: function(row, type, val, meta) {
                    if(row.Upload.game_id != null) {
                        if (type === 'display') {
                            return `<a href="/games/view/${row.Upload.game_id}?${params.toString()}">${row.Game.game_name}</a>`;
                        }
                        return row.Game.game_name;
                    }

                    return "N/A";
                }
            },
        ]
    });

    function updateImportTable(table) {
        let url =
            "<?php echo html_entity_decode($this->Html->url(['controller' => 'uploads', 'action' => 'getImportList', 'ext' => 'json'])); ?>"
        table.ajax.url(url).load();

        setTimeout(function() {
            updateImportTable(table);
        }, 30000)
    }

    updateImportTable(importTable);
});
</script>