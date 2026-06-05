// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import * as React from "react"
import { getPresignedUrlsAction } from "../actions"
import { Button } from "@/components/ui/button"
import { UploadSimpleIcon, XIcon, FileIcon } from "@phosphor-icons/react"

interface UploadZoneProps {
  onUploadComplete: (s3Keys: string[]) => void
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [files, setFiles] = React.useState<File[]>([])
  const [isDragging, setIsDragging] = React.useState(false)
  const [isPending, setIsPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const tdfFiles = Array.from(incoming).filter((f) =>
      f.name.toLowerCase().endsWith(".tdf"),
    )
    const rejected = Array.from(incoming).length - tdfFiles.length
    if (rejected > 0) {
      setError(`${rejected} file(s) skipped — only .tdf files are allowed`)
    } else {
      setError(null)
    }
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      const newFiles = tdfFiles.filter((f) => !existing.has(f.name))
      return [...prev, ...newFiles]
    })
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function onDragLeave() {
    setIsDragging(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function handleUpload() {
    if (files.length === 0) return
    setIsPending(true)
    setError(null)
    try {
      const presigned = await getPresignedUrlsAction(files.map((f) => f.name))

      await Promise.all(
        presigned.map(({ filename, url }) => {
          const file = files.find((f) => f.name === filename)!
          return fetch(url, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": "application/octet-stream" },
          }).then((res) => {
            if (!res.ok) throw new Error(`Failed to upload ${filename}`)
          })
        }),
      )

      setFiles([])
      onUploadComplete(presigned.map((p) => p.filename))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/50"
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <UploadSimpleIcon className="mx-auto size-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Drag and drop .tdf files here, or click to choose
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".tdf"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <Button onClick={handleUpload} disabled={isPending} className="w-full">
            {isPending ? "Uploading…" : `Upload ${files.length} file${files.length === 1 ? "" : "s"}`}
          </Button>

          {files.map((file) => (
            <div
              key={file.name}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(file.name)
                }}
                className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${file.name}`}
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
