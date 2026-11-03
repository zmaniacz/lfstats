# Chomper Deployment

Chomper runs in production as a worker (`src/worker.ts`) in a container beside Postgres. It pulls S3 upload events from SQS and runs each file through the ingest pipeline in `src/process-file.ts`. Every connection it makes is outbound, so Postgres needs no internet exposure.

The CloudFormation stack `lfstats-chomper` holds the AWS side: the upload queue, the dead-letter queue, and their alarms. The worker image ships from `build-chomper.yml`, and the stack from `deploy-chomper.yml`.

Chomper ran as an AWS Lambda until November 2026. It needed a publicly reachable Postgres, which is why it was replaced.

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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`   | Optional. Without them, nothing is pushed   |

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

### Setting up the worker

1. Deploy the stack, then read `ChomperQueueUrl` from its outputs.
2. Create the IAM user above and an access key for it.
3. Add the `chomper` service from [`apps/web/docker-compose.yml`](../web/docker-compose.yml) to the host's compose file, and add these to the host's `.env`: `CHOMPER_AWS_REGION`, `CHOMPER_AWS_ACCESS_KEY_ID`, `CHOMPER_AWS_SECRET_ACCESS_KEY`, `CHOMPER_QUEUE_URL`, `INCOMING_BUCKET`, `ARCHIVE_BUCKET`, `ERROR_BUCKET`.
4. Set the repository variable `CHOMPER_WORKER_DEPLOY=true` and run `build-chomper` from the Actions tab on `main`. The runner logs in to GHCR, which a manual pull may not be able to do. Check the log says `Chomper worker started`.
5. To test it without a real upload, copy an already-ingested game from the archive to the incoming bucket as `worker-smoke-test`. The bucket notification only fires on `.tdf` names, so then `aws sqs send-message` a body of `{"Records":[{"s3":{"bucket":{"name":"INCOMING_BUCKET"},"object":{"key":"worker-smoke-test"}}}]}`. The file should leave the incoming bucket and the job should be `skipped` as a duplicate, with the game untouched.

The incoming bucket has versioning on, with old versions expiring after 30 days, so a file the worker deletes stays recoverable for a while.

## Pipeline secrets

`deploy-chomper.yml` expects these repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `INCOMING_BUCKET`
- `ERROR_EMAIL_ADDRESS`

`build-chomper.yml` reads one repository variable, `CHOMPER_WORKER_DEPLOY`, which is `true` once the worker should redeploy on the host after each push.

## Deploying the stack by hand

The workflow does this on every change to `template.yaml`. From the repository root:

```bash
aws cloudformation deploy --template-file apps/chomper/template.yaml --stack-name lfstats-chomper --capabilities CAPABILITY_IAM --parameter-overrides IncomingBucket=<incoming-bucket> ErrorEmailAddress=<email>
```

Then point the incoming bucket's `.tdf` notification at the queue, as the workflow's last step does.

## Local development

Scripts and the CLIs read `DATABASE_URL` from `packages/db/.env`. Postgres only accepts connections from the LAN and the Docker network, so use its LAN address there, not a public hostname.
