<?php echo $this->element('breadcrumbs'); ?>
<hr>
<?php if ('all' === $this->Session->read('state.gametype')) { ?>
<div class="alert alert-warning" role="alert">
    You must select either Social or Competitive games above
</div>
<?php } elseif ('social' == $this->Session->read('state.gametype') && 0 == $this->Session->read('state.centerID')) { ?>
<div class="alert alert-warning" role="alert">
    You must select a Center above.
</div>
<?php } elseif ('league' == $this->Session->read('state.gametype') && 0 == $this->Session->read('state.leagueID')) { ?>
<div class="alert alert-warning" role="alert">
    You must select a Competition above.
</div>
<?php } else { ?>
<?php
    echo $this->Html->css(['JqueryFileUpload/jquery.fileupload', 'JqueryFileUpload/jquery.fileupload-ui']);
?>
<div class="alert alert-danger" role="alert">
    I know you don't know what this page is or what it does. So don't click anything.
</div>
<div class="alert alert-warning" role="alert">
    With the launch of (redacted), the upload process has changed. Pay attention to the new instructions.
</div>
<div>
    <ol>
        <li>For social games, choose to either add to an existing event or create a new one.</li>
        <li>Click Add Files to (duh) add files</li>
        <li>Click Start upload. The files will upload and the import will begin automatically</li>
    </ol>
</div>
<hr>
<div id="eventChoices">
    <div id="eventRadio" class="btn-group btn-group-toggle" data-toggle="buttons">
        <label class="btn btn-outline-info active">
            <input type="radio" name="rounds" id="newEvent" value="0" autocomplete="off" checked>Create New
        </label>
        <label class="btn btn-outline-info">
            <input type="radio" name="rounds" id="existingEvent" value="1" autocomplete="off">Choose Existing
        </label>
    </div>
    <div id="eventCreateForm">
        <form class="form-inline p-2">
            <label for="eventNameInput" class="mx-1">New Event Name:</label>
            <input type="text" class="form-control mx-1" id="eventNameInput"
                value="Socials <?php echo date('Y-m-d'); ?>">
            <button type="submit" class="btn btn-info mx-1">Create</button>
        </form>
    </div>
    <div id="eventExistingForm" style="display:none">
    </div>
</div>
<div id="selectedEventInfo">
</div>
<hr>
<div id="uploadForm" style="display:none">
    <!-- The file upload form used as target for the file upload widget -->
    <!--<form id="fileupload" action="uploads/upload" method="POST" enctype="multipart/form-data">-->
    <?php echo $this->Form->create('fileupload', ['type' => 'file', 'id' => 'fileupload']); ?>
    <!-- The fileupload-buttonbar contains buttons to add/delete files and start/cancel the upload -->
    <div class="row fileupload-buttonbar">
        <div class="col-lg-7">
            <!-- The fileinput-button span is used to style the file input field as button -->
            <span class="btn btn-success fileinput-button">
                <i class="glyphicon glyphicon-plus"></i>
                <span>Add files...</span>
                <input type="file" name="files[]" accept="text/tab-separated-values" multiple>
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
    <table role="presentation" class="table table-striped">
        <tbody class="files"></tbody>
    </table>
    </form>
</div>
<?php } ?>
<!-- The template to display files available for upload -->
<script id="template-upload" type="text/x-tmpl">
    {% for (var i=0, file; file=o.files[i]; i++) { %}
    <tr class="template-upload">
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
    <tr class="template-download">
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
<script type="text/javascript">
    $(document).ready(function() {
        $("#eventRadio :input").change(function() {
            $("#eventCreateForm").toggle();
            $("#eventExistingForm").toggle();
        });

        $(function() {
            'use strict';

            // Initialize the jQuery File Upload widget:
            $('#fileupload').fileupload({
                // Uncomment the following to send cross-domain cookies:
                //xhrFields: {withCredentials: true},
                url: "<?php echo html_entity_decode($this->Html->url(['action' => 'handleUploads', 'TDF'])); ?>"
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
            }).always(function() {
                $(this).removeClass('fileupload-processing');
            }).done(function(result) {
                $(this).fileupload('option', 'done')
                    .call(this, $.Event('done'), {
                        result: result
                    });
            });

        });
    });
</script>