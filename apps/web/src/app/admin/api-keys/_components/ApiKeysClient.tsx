// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { ApiKeyListing } from "@lfstats/db";

type Props = {
  keys: ApiKeyListing[];
  createAction: (formData: FormData) => Promise<{ plaintext: string }>;
  revokeAction: (id: string) => Promise<void>;
};

export function ApiKeysClient({ keys, createAction, revokeAction }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setIsPending(true);
    try {
      const formData = new FormData();
      formData.set("name", name.trim());
      const { plaintext } = await createAction(formData);
      setCreateOpen(false);
      setName("");
      // Shown once — the plaintext is not recoverable after this dialog closes.
      setNewKey(plaintext);
    } finally {
      setIsPending(false);
    }
  }

  async function handleRevoke(id: string) {
    setIsPending(true);
    try {
      await revokeAction(id);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">API Keys</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Create Key
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Keys let external tools post game and player POV video links. They grant write access across
        every center, so issue them sparingly and revoke unused keys.
      </p>

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API keys yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id} className={k.revokedAt ? "opacity-50" : undefined}>
                <TableCell className="font-medium">
                  {k.name}
                  {k.revokedAt && (
                    <Badge variant="destructive" className="ml-2 text-xs px-1 py-0">
                      Revoked
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{k.keyPrefix}…</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {k.createdByEmail ?? "—"}
                </TableCell>
                <TableCell className="text-sm">{formatDateTime(k.createdAt)}</TableCell>
                <TableCell className="text-sm">
                  {k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  {!k.revokedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRevoke(k.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Name the tool this key is for, so it can be identified later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. OBS Capture Tool"
              />
            </div>
            <Button onClick={handleCreate} disabled={isPending || !name.trim()} className="w-full">
              {isPending ? "Creating…" : "Create Key"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNewKey(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>
              This is the only time the key will be shown. Store it somewhere safe before closing
              this dialog — it cannot be recovered afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <code className="block w-full break-all rounded-md border bg-muted p-3 font-mono text-sm">
              {newKey}
            </code>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                if (newKey) await navigator.clipboard.writeText(newKey);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                setNewKey(null);
                setCopied(false);
              }}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
