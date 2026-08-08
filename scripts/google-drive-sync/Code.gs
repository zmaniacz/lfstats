// Google Apps Script — syncs new TDF files from a Google Drive folder to S3.
//
// Folder structure:
//   root/            → TDFs here upload to S3 as {filename}.tdf (social / non-competition)
//   root/slug-name/  → TDFs here upload to S3 as slug-name/{filename}.tdf
//   root/_processed/ → files are moved here after a successful upload
//
// Subfolders whose names match a competition slug route games to that competition.
// Files in the root folder have no prefix and are automatically treated as social games.
//
// Uploaded files are moved into _processed/ (mirroring the slug structure) rather than
// being recorded in a tracking property. That keeps stored state at zero and keeps each
// run's work proportional to the number of *new* files instead of the whole archive.
// To re-upload something, drag it out of _processed/ back into its folder.
//
// Setup:
//   1. Open https://script.google.com and create a new project
//   2. Paste this file into Code.gs
//   3. Run setupProperties() once to configure your settings
//   4. Run installTrigger() once to start the 5-minute polling loop
//
// Script Properties (set via setupProperties or manually in Project Settings):
//   DRIVE_FOLDER_ID       — the Google Drive folder ID to watch
//   S3_BUCKET             — your chomper incoming S3 bucket name
//   S3_REGION             — AWS region (e.g. us-east-1)
//   AWS_ACCESS_KEY_ID     — IAM user access key with s3:PutObject on the bucket
//   AWS_SECRET_ACCESS_KEY — IAM user secret key

// Subfolder that uploaded files are moved into. Skipped by the competition-slug walk.
var PROCESSED_FOLDER_NAME = "_processed";

// Apps Script kills an execution at 6 minutes. Stop starting new uploads before then so
// a large backlog drains over several runs instead of dying partway through one.
var MAX_RUNTIME_MS = 4.5 * 60 * 1000;

// ─── Entry point (called by time-driven trigger) ───────────────────────────

function syncNewTdfs() {
  // The 5-minute trigger can overlap a manual run or a slow previous run. Without this,
  // two executions upload the same files concurrently.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log("Another sync is already running — skipping this run");
    return;
  }

  try {
    runSync_();
  } finally {
    lock.releaseLock();
  }
}

function runSync_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("DRIVE_FOLDER_ID");
  var cfg = {
    bucket: props.getProperty("S3_BUCKET"),
    region: props.getProperty("S3_REGION"),
    accessKey: props.getProperty("AWS_ACCESS_KEY_ID"),
    secretKey: props.getProperty("AWS_SECRET_ACCESS_KEY"),
  };

  if (!folderId || !cfg.bucket || !cfg.region || !cfg.accessKey || !cfg.secretKey) {
    throw new Error("Missing script properties — run setupProperties() first");
  }

  var deadline = Date.now() + MAX_RUNTIME_MS;
  var rootFolder = DriveApp.getFolderById(folderId);

  // Created lazily so an idle sync never touches Drive's folder structure at all.
  var processedRoot = lazyFolder_(function () {
    return getOrCreateFolder_(rootFolder, PROCESSED_FOLDER_NAME);
  });

  // Root folder → no prefix (unprefixed files are treated as social games by chomper)
  var result = uploadTdfsFromFolder_(rootFolder, "", cfg, processedRoot, deadline);
  var uploaded = result.uploaded;
  var deferred = result.deferred;

  // Each subfolder → folder name becomes the S3 key prefix (competition slug)
  var subfolders = rootFolder.getFolders();
  while (subfolders.hasNext()) {
    var subfolder = subfolders.next();
    var slug = subfolder.getName();
    if (slug === PROCESSED_FOLDER_NAME) continue;

    // Consumed synchronously below, so capturing the loop's `slug` directly is safe.
    var slugDest = lazyFolder_(function () {
      return getOrCreateFolder_(processedRoot(), slug);
    });

    var subResult = uploadTdfsFromFolder_(subfolder, slug, cfg, slugDest, deadline);
    uploaded += subResult.uploaded;
    deferred += subResult.deferred;
  }

  if (uploaded > 0) {
    Logger.log("Sync complete — uploaded " + uploaded + " file(s)");
  }
  if (deferred > 0) {
    Logger.log("Hit the runtime budget with " + deferred + " file(s) left — resuming next run");
  }
}

/**
 * Uploads every .tdf in `folder` to S3, moving each one into the processed folder as
 * soon as its upload succeeds.
 *
 * @param getDestFolder  Zero-arg function returning the destination folder, called only
 *                       when there is actually something to move.
 * @param deadline       Epoch ms after which no further uploads are started.
 */
function uploadTdfsFromFolder_(folder, s3Prefix, cfg, getDestFolder, deadline) {
  // Collect first: moving files out of a folder while iterating its own file iterator
  // is not something Drive guarantees, and would silently skip entries.
  var pending = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().toLowerCase().endsWith(".tdf")) pending.push(file);
  }

  var uploaded = 0;

  for (var i = 0; i < pending.length; i++) {
    if (Date.now() > deadline) {
      return { uploaded: uploaded, deferred: pending.length - i };
    }

    var pendingFile = pending[i];
    var name = pendingFile.getName();
    var s3Key = s3Prefix ? s3Prefix + "/" + name : name;

    try {
      putS3Object_(cfg.bucket, cfg.region, s3Key, pendingFile.getBlob().getBytes(), cfg.accessKey, cfg.secretKey);
    } catch (e) {
      // Left in place, so the next run retries it.
      Logger.log("ERROR uploading " + name + ": " + e.message);
      continue;
    }

    uploaded++;
    Logger.log("Uploaded: " + name + " → s3://" + cfg.bucket + "/" + s3Key);

    try {
      pendingFile.moveTo(getDestFolder());
    } catch (e) {
      // Upload succeeded but the file stays put, so it will be re-uploaded next run.
      // Chomper dedupes on game start time, so this is noisy rather than harmful.
      Logger.log(
        "ERROR moving " + name + " to " + PROCESSED_FOLDER_NAME + "/ (it will re-upload next run): " + e.message,
      );
    }
  }

  return { uploaded: uploaded, deferred: 0 };
}

// ─── Drive folder helpers ──────────────────────────────────────────────────

function getOrCreateFolder_(parent, name) {
  var existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

/** Defers a folder lookup/creation until something actually needs the folder. */
function lazyFolder_(resolve) {
  var cached = null;
  return function () {
    if (!cached) cached = resolve();
    return cached;
  };
}

// ─── AWS Signature V4 for S3 PutObject ─────────────────────────────────────

function putS3Object_(bucket, region, key, contentBytes, accessKey, secretKey) {
  var service = "s3";
  var host = bucket + ".s3." + region + ".amazonaws.com";
  var now = new Date();
  var dateStamp = Utilities.formatDate(now, "UTC", "yyyyMMdd");
  var amzDate = Utilities.formatDate(now, "UTC", "yyyyMMdd'T'HHmmss'Z'");

  var payloadHash = hexSha256_(contentBytes);

  var canonicalHeaders =
    "host:" + host + "\n" +
    "x-amz-content-sha256:" + payloadHash + "\n" +
    "x-amz-date:" + amzDate + "\n";
  var signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  // SigV4 requires !'()* percent-encoded too, which encodeURIComponent leaves alone.
  // A mismatch here produces a SignatureDoesNotMatch on filenames containing them.
  var encodedKey = key.split("/").map(function(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, function(c) {
      return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }).join("/");

  var canonicalRequest =
    "PUT\n" +
    "/" + encodedKey + "\n" +
    "\n" +
    canonicalHeaders + "\n" +
    signedHeaders + "\n" +
    payloadHash;

  var credentialScope = dateStamp + "/" + region + "/" + service + "/aws4_request";
  var stringToSign =
    "AWS4-HMAC-SHA256\n" +
    amzDate + "\n" +
    credentialScope + "\n" +
    hexSha256_(Utilities.newBlob(canonicalRequest).getBytes());

  var signingKey = getSignatureKey_(secretKey, dateStamp, region, service);
  var signature = hexHmacSha256_(signingKey, stringToSign);

  var authHeader =
    "AWS4-HMAC-SHA256 Credential=" + accessKey + "/" + credentialScope +
    ", SignedHeaders=" + signedHeaders +
    ", Signature=" + signature;

  var url = "https://" + host + "/" + encodedKey;

  var response = UrlFetchApp.fetch(url, {
    method: "put",
    payload: contentBytes,
    contentType: "application/octet-stream",
    headers: {
      "Authorization": authHeader,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("S3 PUT failed (" + code + "): " + response.getContentText());
  }
}

// ─── Crypto helpers ────────────────────────────────────────────────────────

function hexSha256_(data) {
  var raw = typeof data === "string"
    ? Utilities.newBlob(data).getBytes()
    : data;
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return bytesToHex_(hash);
}

function hmacSha256_(key, message) {
  var keyBytes = typeof key === "string"
    ? Utilities.newBlob(key).getBytes()
    : key;
  var msgBytes = typeof message === "string"
    ? Utilities.newBlob(message).getBytes()
    : message;
  return Utilities.computeHmacSha256Signature(msgBytes, keyBytes);
}

function hexHmacSha256_(key, message) {
  return bytesToHex_(hmacSha256_(key, message));
}

function getSignatureKey_(secretKey, dateStamp, region, service) {
  var kDate = hmacSha256_("AWS4" + secretKey, dateStamp);
  var kRegion = hmacSha256_(kDate, region);
  var kService = hmacSha256_(kRegion, service);
  var kSigning = hmacSha256_(kService, "aws4_request");
  return kSigning;
}

function bytesToHex_(bytes) {
  return bytes.map(function(b) {
    return ("0" + ((b + 256) % 256).toString(16)).slice(-2);
  }).join("");
}

// ─── One-time setup helpers ────────────────────────────────────────────────

/**
 * Run this once to configure your script properties.
 * Edit the values below before running.
 */
function setupProperties() {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    DRIVE_FOLDER_ID:       "YOUR_FOLDER_ID_HERE",      // from the Drive folder URL
    S3_BUCKET:             "YOUR_INCOMING_BUCKET_HERE", // e.g. lfstats-incoming
    S3_REGION:             "us-east-1",                 // your bucket's region
    AWS_ACCESS_KEY_ID:     "YOUR_ACCESS_KEY_HERE",
    AWS_SECRET_ACCESS_KEY: "YOUR_SECRET_KEY_HERE",
  });
  Logger.log("Properties saved. Now run installTrigger().");
}

/**
 * Run this once to install the 5-minute polling trigger.
 */
function installTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "syncNewTdfs") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("syncNewTdfs")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("Trigger installed — syncNewTdfs will run every 5 minutes");
}

/**
 * Remove the polling trigger.
 */
function uninstallTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "syncNewTdfs") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log("Removed " + removed + " trigger(s)");
}
