# Chomper Deployment

Chomper has two production entry points that run the same pipeline (`src/process-file.ts`):

- **The worker** (`src/worker.ts`) runs in a container beside Postgres and pulls S3 upload events from SQS. Every connection it makes is outbound, so the database needs no internet exposure.
- **The Lambda** (`src/index.ts`) is the original path. It needs a publicly reachable Postgres and is retired by the [cutover](#cutover).

The repository variable `CHOMPER_INGEST_TARGET` picks which one receives uploads. An S3 event has one destination, so it is one or the other: `sqs` for the worker, anything else for the Lambda.

The SAM stack holds the AWS side of both: the queue, dead-letter queue and alarms as well as the Lambda.

## The worker

### What happens to a file

| Situation                                   | Result                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Ingested, skipped, rejected, or failed      | Outcome is on the ChomperJob, the file has left the incoming bucket, the message is gone |
| Postgres is down                            | The worker stops receiving. Messages wait in SQS for up to 14 days                       |
| The worker is down                          | The same. `ChomperQueueAgeAlarm` emails once the oldest message is an hour old           |
| The outcome can't be recorded mid-file      | The message reappears after the 5-minute visibility timeout and is retried               |
| Delivered five times without being recorded | Moved to `lfstats-chomper-dlq`, which raises `ChomperDLQAlarm`                           |

The worker checks Postgres before each receive because every receive counts towards the five. Without that, a short database outage would send good files to the dead-letter queue.

The worker processes one file at a time. A burst of uploads waits in the queue, and ingests can't deadlock each other.

On `SIGTERM` it finishes the file in progress and exits. `stop_grace_period` in the compose file has to stay longer than the slowest ingest.

### Environment

| Variable                                                   | Description                                 |
| ---------------------------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`                                             | Postgres, over the `lfstats` Docker network |
| `CHOMPER_QUEUE_URL`                                        | The stack's `ChomperQueueUrl` output        |
| `INCOMING_BUCKET`, `ARCHIVE_BUCKET`, `ERROR_BUCKET`        | The three TDF buckets                       |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Region and the `chomper-worker` IAM user    |
| `NEW_GAME_WEBHOOK_URL`                                     | Optional, see [webhook.ts](src/webhook.ts)  |

### IAM user

Create an IAM user (e.g. `chomper-worker`) by hand, like the `gdrive-sync` user, with only this policy. Keep it separate from the web app's keys.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
      "Resource": "arn:aws:sqs:REGION:ACCOUNT:lfstats-chomper-incoming"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::INCOMING_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::ARCHIVE_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::ERROR_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": ["arn:aws:s3:::INCOMING_BUCKET", "arn:aws:s3:::ARCHIVE_BUCKET"]
    }
  ]
}
```

`s3:ListBucket` is not optional. Without it S3 answers 403 instead of 404 for a missing object, and the pipeline can't tell "already archived" from a real failure.

### Cutover

Merging doesn't change where uploads go, but it does deploy the refactored pipeline and new permissions to the live Lambda, so check an upload afterwards. Each step below is reversible until step 7.

1. **Merge.** `deploy-chomper.yml` creates the queue and alarms and updates the Lambda, which keeps receiving uploads. Upload a TDF and confirm it ingests.
2. **Set up the host.** Create the IAM user, add the `chomper` service from [`apps/web/docker-compose.yml`](../web/docker-compose.yml) to the host's compose file, and add these to the host's `.env`: `CHOMPER_AWS_REGION`, `CHOMPER_AWS_ACCESS_KEY_ID`, `CHOMPER_AWS_SECRET_ACCESS_KEY`, `CHOMPER_QUEUE_URL`, `INCOMING_BUCKET`, `ARCHIVE_BUCKET`, `ERROR_BUCKET`.
3. **Start the worker.** Set the repository variable `CHOMPER_WORKER_DEPLOY=true` and run `build-chomper` from the Actions tab on `main`. The runner logs in to GHCR, which a manual pull may not be able to do. Check the log says `Chomper worker started`.
4. **Smoke test it.** The bucket notification only fires on `.tdf` names, so copy an already-ingested game from the archive to the incoming bucket as `worker-smoke-test`, then `aws sqs send-message` a body of `{"Records":[{"s3":{"bucket":{"name":"INCOMING_BUCKET"},"object":{"key":"worker-smoke-test"}}}]}`. The file should leave the incoming bucket and the job should be `skipped` as a duplicate, with the game untouched.
5. **Protect the incoming bucket.** Turn on S3 versioning and add a lifecycle rule that expires noncurrent versions, so a deleted file stays recoverable for a while.
6. **Flip uploads to SQS.** Set the repository variable `CHOMPER_INGEST_TARGET=sqs` and run `Deploy Chomper` from the Actions tab. Upload a test file. To go back, clear the variable and run it again. Leave it for a few days, including one worker restart during an ingest. Stop the worker once to confirm the queue-age alarm emails you.
7. **Close Postgres.** Check the Postgres connection logs for other outside clients first, then remove the port forward and tighten `pg_hba.conf`. Confirm 5432 is closed from outside your network, and **rotate the Postgres password**.
8. **Remove the Lambda.** Do this in a PR rather than by hand, because a manual delete would be undone by the next deploy: remove the function and its permission from `template.yaml`, the Lambda branch in `deploy-chomper.yml`, `src/index.ts`, and `DB_SECRET_ARN`. Then delete the Secrets Manager secret.

## Lambda secret shape

The Lambda reads the database connection details from AWS Secrets Manager. The secret must contain a JSON object with the following keys:

```json
{
  "username": "user",
  "password": "pass",
  "engine": "postgres",
  "host": "host",
  "port": "port",
  "dbname": "db_name"
}
```

### Required fields

- `username`
- `password`
- `host`
- `port`
- `dbname`

### Optional field

- `engine`: if present, it must be `postgres`.

## Runtime credential behavior

Chomper supports two runtime modes:

1. **Local development**
   - Use `DATABASE_URL` in `.env` or local environment.
   - Example: `postgres://user:pass@host:5432/db_name`

2. **Production deployment**
   - Use `DATABASE_SECRET_ARN` to point to the Secrets Manager secret ARN.
   - The Lambda resolves the secret at startup and builds `DATABASE_URL` from the JSON values.

If `DATABASE_URL` is set, it takes precedence. Otherwise, the Lambda requires `DATABASE_SECRET_ARN`.

## Pipeline secrets

The GitHub Actions deployment workflow expects these repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `SAM_DEPLOYMENT_BUCKET`
- `INCOMING_BUCKET`
- `ARCHIVE_BUCKET`
- `ERROR_BUCKET`
- `DB_SECRET_ARN`
- `ERROR_EMAIL_ADDRESS`

And these optional repository variables:

- `CHOMPER_INGEST_TARGET`: `sqs` sends uploads to the worker's queue; otherwise they go to the Lambda
- `CHOMPER_WORKER_DEPLOY`: `true` makes `build-chomper.yml` redeploy the worker on the host

## Deployment instructions

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter chomper build
```

Then deploy with SAM via the workflow or manually:

```bash
sam validate --template apps/chomper/template.yaml
sam package --template-file apps/chomper/template.yaml --output-template-file apps/chomper/packaged.yaml --s3-bucket <deployment-bucket>
sam deploy --template-file apps/chomper/packaged.yaml --stack-name lfstats-chomper --capabilities CAPABILITY_IAM --parameter-overrides IncomingBucket=<incoming-bucket> ArchiveBucket=<archive-bucket> DbSecretArn=<secret-arn> ErrorEmailAddress=<email>
```

### Notes

- The Lambda handler is built to `dist/index.js` from `apps/chomper/src/index.ts`.
- The deployment uses a dead-letter SQS queue and an SNS email alarm for failure visibility.
- Local development can still use the same database host but uses `.env` instead of Secrets Manager.
