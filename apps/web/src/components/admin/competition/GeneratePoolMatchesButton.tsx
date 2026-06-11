// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  action: () => Promise<void>;
}

export function GeneratePoolMatchesButton({ action }: Props) {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await action();
    } finally {
      window.location.reload();
    }
  }

  return (
    <Button variant="secondary" size="sm" disabled={isPending} onClick={handleClick}>
      {isPending ? "Generating…" : "Generate Matches"}
    </Button>
  );
}
