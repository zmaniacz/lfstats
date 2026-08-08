# Google Drive → S3 Sync for Chomper

Automatically syncs new TDF files from a Google Drive folder to your S3 incoming bucket, where the existing chomper Lambda picks them up.

## Folder structure

```
My Drive/
  └── LFstats TDFs/              ← this is DRIVE_FOLDER_ID
        ├── game3.tdf             ← uploads as game3.tdf (social)
        ├── summer-2026/          ← subfolder name = competition slug
        │     └── match7.tdf      ← uploads as summer-2026/match7.tdf
        ├── fall-league/
        │     └── finals.tdf      ← uploads as fall-league/finals.tdf
        └── _processed/           ← files land here after a successful upload
              ├── game1.tdf
              ├── game2.tdf
              └── summer-2026/
                    └── match1.tdf
```

- **Root folder** — TDFs upload with no prefix (chomper treats unprefixed files as social games)
- **Subfolders** — the folder name becomes the S3 key prefix, which chomper uses as the competition slug
- **`_processed/`** — created automatically, mirrors the slug structure, and is skipped by the competition walk

To add a new competition, just create a subfolder whose name matches the competition slug in your database.

## How it works

1. A Google Apps Script runs every 5 minutes via a time-driven trigger
2. It scans the root folder and each competition subfolder for `.tdf` files
3. New files are uploaded directly to S3 using AWS Signature V4
4. Each file is moved into `_processed/` as soon as its upload succeeds, so the next run only sees new files

The `_processed/` folder _is_ the record of what has been uploaded — the script stores no
tracking state of its own. To re-upload a file, drag it out of `_processed/` back into its
folder; it will go up on the next run.

A failed upload leaves the file where it is, so the next run retries it automatically.

## Setup

### 1. Create an IAM user for the script

Create an IAM user (e.g. `gdrive-sync`) with a policy that only allows PutObject on your incoming bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::YOUR_INCOMING_BUCKET/*"
    }
  ]
}
```

Generate an access key pair for this user.

### 2. Create the Apps Script project

1. Go to https://script.google.com and click **New project**
2. Replace the contents of `Code.gs` with the code from [Code.gs](Code.gs)
3. Save the project (name it something like "LFstats Drive Sync")

### 3. Configure properties

Edit the values in the `setupProperties()` function:

| Property                | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `DRIVE_FOLDER_ID`       | The folder ID from the Google Drive URL (the part after `/folders/`) |
| `S3_BUCKET`             | Your chomper incoming bucket name                                    |
| `S3_REGION`             | The bucket's AWS region (e.g. `us-east-1`)                           |
| `AWS_ACCESS_KEY_ID`     | The IAM user's access key                                            |
| `AWS_SECRET_ACCESS_KEY` | The IAM user's secret key                                            |

Then run `setupProperties()` from the Apps Script editor (select it from the function dropdown and click Run).

### 4. Install the trigger

Run `installTrigger()` from the editor. This creates a time-driven trigger that calls `syncNewTdfs()` every 5 minutes.

You'll be prompted to authorize the script to access Google Drive and make external HTTP requests.

### 5. Test it

Drop a `.tdf` file into the root Drive folder, then run `syncNewTdfs()` manually from the editor. Check the execution log — you should see `Uploaded: game.tdf → s3://bucket/game.tdf`.

## Management

| Function             | Purpose                          |
| -------------------- | -------------------------------- |
| `syncNewTdfs()`      | Run manually to sync immediately |
| `uninstallTrigger()` | Stop the automatic polling       |
| `installTrigger()`   | Restart polling                  |

To re-upload files, move them out of `_processed/` — there is no reset function to run.

## Adding a competition

1. Create a subfolder in the Drive folder whose name matches the competition slug
2. That's it — the script auto-discovers subfolders on every run

## Limits

- Apps Script time-driven triggers run at minimum every 1 minute, configured here at 5 minutes
- Each execution has a 6-minute timeout. The script stops starting new uploads at 4.5 minutes and
  logs how many it deferred, so a large backlog drains across several runs instead of being killed
  partway through one
- A `LockService` lock prevents an overlapping manual run from double-uploading
- The script stores no per-file state. Tracking uploads in a Script Property is tempting but
  does not scale: Apps Script caps a single property **value** at 9 KB — roughly 260 Drive file
  IDs — after which every write fails and files start re-uploading on every run. Moving files
  into `_processed/` keeps stored state at zero and keeps each run's work proportional to the
  number of new files rather than the size of the archive
