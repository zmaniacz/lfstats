// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A monospace block with a copy button, for URLs, commands and config snippets. */
export function CopyableCode({
  value,
  multiline = false,
  label = "Copy",
}: {
  value: string;
  multiline?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (permissions, insecure context); the text is still
      // there to select by hand.
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted p-2">
      <code
        className={cn(
          "min-w-0 flex-1 font-mono text-sm",
          multiline ? "overflow-x-auto whitespace-pre" : "break-all",
        )}
      >
        {value}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        onClick={copy}
        aria-label={copied ? "Copied" : label}
        title={copied ? "Copied" : label}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
