// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import * as React from "react"
import { UploadZone } from "./UploadZone"
import { JobStatusTable } from "./JobStatusTable"

export function UploadPage() {
  const [uploadedKeys, setUploadedKeys] = React.useState<string[]>([])

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <UploadZone onUploadComplete={(keys) => setUploadedKeys(keys)} />
      </div>
      {uploadedKeys.length > 0 && (
        <div className="rounded-lg border p-6">
          <JobStatusTable s3Keys={uploadedKeys} />
        </div>
      )}
    </div>
  )
}
