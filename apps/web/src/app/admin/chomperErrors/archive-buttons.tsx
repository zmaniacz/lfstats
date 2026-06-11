// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { archiveChomperJobAction, archiveAllChomperJobsAction } from "./actions";

export function ArchiveButton({ id }: { id: string }) {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await archiveChomperJobAction(id);
    } finally {
      window.location.reload();
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
      {isPending ? "Archiving…" : "Archive"}
    </Button>
  );
}

export function ArchiveAllButton() {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await archiveAllChomperJobsAction();
    } finally {
      window.location.reload();
    }
  }

  return (
    <Button variant="outline" disabled={isPending} onClick={handleClick}>
      {isPending ? "Archiving…" : "Archive All"}
    </Button>
  );
}
