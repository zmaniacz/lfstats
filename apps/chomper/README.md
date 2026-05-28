# Chomper AWS SAM Deployment

This README explains how Chomper is deployed with AWS SAM, what secrets it expects, and how local development differs from production.

## Secret shape

In production, Chomper reads the database connection details from AWS Secrets Manager. The secret must contain a JSON object with the following keys:

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
- `DB_SECRET_ARN`
- `ERROR_EMAIL_ADDRESS`

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
