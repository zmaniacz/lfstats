// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EDIT_MODE_COOKIE } from "@/lib/edit-mode";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Admin-only switch that reveals mutation controls on game detail pages, persisted in a cookie. */
export function EditModeToggle({ editMode }: { editMode: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(editMode);

  function handleChange(next: boolean) {
    setChecked(next);
    document.cookie = `${EDIT_MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Switch id="edit-mode" checked={checked} onCheckedChange={handleChange} />
      <Label htmlFor="edit-mode" className="text-sm font-medium">
        Edit mode
      </Label>
    </div>
  );
}
