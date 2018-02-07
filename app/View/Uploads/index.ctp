<?php
    echo $this->Html->css(array('JqueryFileUpload/jquery.fileupload','JqueryFileUpload/jquery.fileupload-ui'));
?>
<div>
    <ol>
        <li>Choose to add these scorecards to a new or an existing event (in most cases, you'll just want a new event)</li>
        <li>Click Add Files to (duh) add files.  Then click Start upload to start uploading them (also duh).  Once they are uploaded, click Process to start the import.</li>
    </ol>
</div>
<form class="form-inline" action="<?= $this->Html->url(array('controller' => 'uploads', 'action' => 'parse')); ?>" id="uploadForm" method="post" accept-charset="utf-8">
    <select class="form-control" name="data[Event][id]" id="uploadSelectEvent">
    <?php
        if($this->Session->read('state.gametype') == 'social' || $this->Session->read('state.gametype') == 'all') {
            //Options should be 'Create New Social Event' or list of all previous Social events at the center
            echo "<option value=\"0\">Create New Social Event</option>";
            foreach($social_events as $event) {
                echo "<option value=\"{$event['Event']['id']}\">{$event['Event']['name']}</option>";
            }
        } else {
            echo "<option value=\"{$selected_league['Event']['id']}\">{$selected_league['Event']['name']}</option>";
        }
    ?>
    </select>
    <input class="form-control" type="text" name="data[Event][name]" id="textEventName" value="Socials <?= date('Y-m-d');?>">
    <button class="btn btn-primary form-control" type="submit">Process <span class="glyphicon glyphicon-play"></span></button>
</form>
    <hr>
<!-- The file upload form used as target for the file upload widget -->
<!--<form id="fileupload" action="uploads/upload" method="POST" enctype="multipart/form-data">-->
    <?php echo $this->Form->create('fileupload', array('type' => 'file', 'id' => 'fileupload')); ?>
    <!-- The fileupload-buttonbar contains buttons to add/delete files and start/cancel the upload -->
    <div class="row fileupload-buttonbar">
        <div class="col-lg-7">
            <!-- The fileinput-button span is used to style the file input field as button -->
            <span class="btn btn-success fileinput-button">
                <i class="glyphicon glyphicon-plus"></i>
                <span>Add files...</span>
                <input type="file" name="files[]" multiple>
            </span>
            <button type="submit" class="btn btn-primary start">
                <i class="glyphicon glyphicon-upload"></i>
                <span>Start upload</span>
            </button>
            <button type="reset" class="btn btn-warning cancel">
                <i class="glyphicon glyphicon-ban-circle"></i>
                <span>Cancel upload</span>
            </button>
            <button type="button" class="btn btn-danger delete">
                <i class="glyphicon glyphicon-trash"></i>
                <span>Delete</span>
            </button>
            <input type="checkbox" class="toggle">
            <!-- The global file processing state -->
            <span class="fileupload-process"></span>
        </div>
        <!-- The global progress state -->
        <div class="col-lg-5 fileupload-progress fade">
            <!-- The global progress bar -->
            <div class="progress progress-striped active" role="progressbar" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar progress-bar-success" style="width:0%;"></div>
            </div>
            <!-- The extended global progress state -->
            <div class="progress-extended">&nbsp;</div>
        </div>
    </div>
    <!-- The table listing the files available for upload/download -->
    <table role="presentation" class="table table-striped"><tbody class="files"></tbody></table>
</form>
<!-- The template to display files available for upload -->
<script id="template-upload" type="text/x-tmpl">
{% for (var i=0, file; file=o.files[i]; i++) { %}
    <tr class="template-upload fade">
        <td>
            <span class="preview"></span>
        </td>
        <td>
            <p class="name">{%=file.name%}</p>
            <strong class="error text-danger"></strong>
        </td>
        <td>
            <p class="size">Processing...</p>
            <div class="progress progress-striped active" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-bar progress-bar-success" style="width:0%;"></div></div>
        </td>
        <td>
            {% if (!i && !o.options.autoUpload) { %}
                <button class="btn btn-primary start" disabled>
                    <i class="glyphicon glyphicon-upload"></i>
                    <span>Start</span>
                </button>
            {% } %}
            {% if (!i) { %}
                <button class="btn btn-warning cancel">
                    <i class="glyphicon glyphicon-ban-circle"></i>
                    <span>Cancel</span>
                </button>
            {% } %}
        </td>
    </tr>
{% } %}
</script>
<!-- The template to display files available for download -->
<script id="template-download" type="text/x-tmpl">
{% for (var i=0, file; file=o.files[i]; i++) { %}
    <tr class="template-download fade">
        <td>
            <span class="preview">
                {% if (file.thumbnailUrl) { %}
                    <a href="{%=file.url%}" title="{%=file.name%}" download="{%=file.name%}" data-gallery><img src="{%=file.thumbnailUrl%}"></a>
                {% } %}
            </span>
        </td>
        <td>
            <p class="name">
                {% if (file.url) { %}
                    <a href="{%=file.url%}" title="{%=file.name%}" download="{%=file.name%}" {%=file.thumbnailUrl?'data-gallery':''%}>{%=file.name%}</a>
                {% } else { %}
                    <span>{%=file.name%}</span>
                {% } %}
            </p>
            {% if (file.error) { %}
                <div><span class="label label-danger">Error</span> {%=file.error%}</div>
            {% } %}
        </td>
        <td>
            <span class="size">{%=o.formatFileSize(file.size)%}</span>
        </td>
        <td>
            {% if (file.deleteUrl) { %}
                <button class="btn btn-danger delete" data-type="{%=file.deleteType%}" data-url="{%=file.deleteUrl%}"{% if (file.deleteWithCredentials) { %} data-xhr-fields='{"withCredentials":true}'{% } %}>
                    <i class="glyphicon glyphicon-trash"></i>
                    <span>Delete</span>
                </button>
                <input type="checkbox" name="delete" value="1" class="toggle">
            {% } else { %}
                <button class="btn btn-warning cancel">
                    <i class="glyphicon glyphicon-ban-circle"></i>
                    <span>Cancel</span>
                </button>
            {% } %}
        </td>
    </tr>
{% } %}
</script>
<script defer src='/js/Javascript-Templates/tmpl.min.js'></script>
<script defer src='/js/JqueryFileUpload/vendor/jquery.ui.widget.js'></script>
<script defer src='/js/JqueryFileUpload/jquery.iframe-transport.js'></script>
<script defer src='/js/JqueryFileUpload/jquery.fileupload.js'></script>
<script defer src='/js/JqueryFileUpload/jquery.fileupload-process.js'></script>
<script defer src='/js/JqueryFileUpload/jquery.fileupload-validate.js'></script>
<script defer src='/js/JqueryFileUpload/jquery.fileupload-ui.js'></script>
<script>
    $(document).ready(function() {
        $('#uploadSelectEvent').change(function() {
			if($(this).val() > 0) {
                $('#textEventName').addClass('hidden');
            } else {
                $('#textEventName').removeClass('hidden');
            }
		});

        $(function () {
            'use strict';

            // Initialize the jQuery File Upload widget:
            $('#fileupload').fileupload({
                // Uncomment the following to send cross-domain cookies:
                //xhrFields: {withCredentials: true},
                url: '<?= html_entity_decode($this->Html->url(array('action' => 'handleUploads'))); ?>'
            });

            // Enable iframe cross-domain access via redirect option:
            $('#fileupload').fileupload(
                'option',
                'redirect',
                window.location.href.replace(
                    /\/[^\/]*$/,
                    '/cors/result.html?%s'
                )
            );

            // Load existing files:
            $('#fileupload').addClass('fileupload-processing');
            $.ajax({
                // Uncomment the following to send cross-domain cookies:
                //xhrFields: {withCredentials: true},
                url: $('#fileupload').fileupload('option', 'url'),
                dataType: 'json',
                context: $('#fileupload')[0]
            }).always(function () {
                $(this).removeClass('fileupload-processing');
            }).done(function (result) {
                $(this).fileupload('option', 'done')
                    .call(this, $.Event('done'), {result: result});
            });

        });
    });
</script>