// Google Apps Script — syncs new TDF files from a Google Drive folder to S3.
//
// Folder structure:
//   root/           → TDFs here upload to S3 as {filename}.tdf (social / non-competition)
//   root/slug-name/ → TDFs here upload to S3 as slug-name/{filename}.tdf
//
// Subfolders whose names match a competition slug route games to that competition.
// Files in the root folder have no prefix and are automatically treated as social games.
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

// ─── Entry point (called by time-driven trigger) ───────────────────────────

function syncNewTdfs() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("DRIVE_FOLDER_ID");
  var bucket = props.getProperty("S3_BUCKET");
  var region = props.getProperty("S3_REGION");
  var accessKey = props.getProperty("AWS_ACCESS_KEY_ID");
  var secretKey = props.getProperty("AWS_SECRET_ACCESS_KEY");

  if (!folderId || !bucket || !region || !accessKey || !secretKey) {
    throw new Error("Missing script properties — run setupProperties() first");
  }

  var rootFolder = DriveApp.getFolderById(folderId);
  var processedIds = getProcessedIds_(props);
  var uploaded = 0;

  // Root folder → no prefix (unprefixed files are treated as social games by chomper)
  uploaded += uploadTdfsFromFolder_(rootFolder, "", bucket, region, accessKey, secretKey, processedIds);

  // Each subfolder → folder name becomes the S3 key prefix (competition slug)
  var subfolders = rootFolder.getFolders();
  while (subfolders.hasNext()) {
    var subfolder = subfolders.next();
    var slug = subfolder.getName();
    uploaded += uploadTdfsFromFolder_(subfolder, slug, bucket, region, accessKey, secretKey, processedIds);
  }

  saveProcessedIds_(props, processedIds);

  if (uploaded > 0) {
    Logger.log("Sync complete — uploaded " + uploaded + " file(s)");
  }
}

function uploadTdfsFromFolder_(folder, s3Prefix, bucket, region, accessKey, secretKey, processedIds) {
  var files = folder.getFiles();
  var uploaded = 0;

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();

    if (!name.toLowerCase().endsWith(".tdf")) continue;
    if (processedIds.has(file.getId())) continue;

    var s3Key = s3Prefix ? s3Prefix + "/" + name : name;

    try {
      putS3Object_(bucket, region, s3Key, file.getBlob().getBytes(), accessKey, secretKey);
      processedIds.add(file.getId());
      uploaded++;
      Logger.log("Uploaded: " + name + " → s3://" + bucket + "/" + s3Key);
    } catch (e) {
      Logger.log("ERROR uploading " + name + ": " + e.message);
    }
  }

  return uploaded;
}

// ─── Processed-file tracking ───────────────────────────────────────────────

function getProcessedIds_(props) {
  var raw = props.getProperty("PROCESSED_IDS") || "";
  return new Set(raw ? raw.split(",") : []);
}

function saveProcessedIds_(props, idSet) {
  props.setProperty("PROCESSED_IDS", Array.from(idSet).join(","));
}

/**
 * Reset tracking so all files are re-uploaded on next sync.
 */
function resetProcessedIds() {
  PropertiesService.getScriptProperties().deleteProperty("PROCESSED_IDS");
  Logger.log("Cleared processed file list — next sync will re-upload all TDFs");
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

  var encodedKey = key.split("/").map(function(segment) {
    return encodeURIComponent(segment);
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
