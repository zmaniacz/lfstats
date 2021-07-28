<dl class="row">
    <?php foreach (json_decode($data['Scorecard']['mvp_details'], true) as $item) : ?>
        <?php if ($item['value'] > 0) : ?>
            <dt class="col-sm-9 text-nowrap"><?= $item['name']; ?>
            </dt>
            <dd class="col-sm-3 text-success text-right"><?= round($item['value'], 2); ?>
            </dd>
        <?php elseif ($item['value'] < 0) : ?>
            <dt class="col-sm-9 text-nowrap"><?= $item['name']; ?>
            </dt>
            <dd class="col-sm-3 text-danger text-right"><?= round($item['value'], 2); ?>
            </dd>
        <?php endif; ?>
    <?php endforeach; ?>
    <hr>
    <dt class="col-sm-9">Total</dt>
    <dd class="col-sm-3 text-primary text-right"><?= round($data['Scorecard']['mvp_points'], 2); ?>
    </dd>
</dl>