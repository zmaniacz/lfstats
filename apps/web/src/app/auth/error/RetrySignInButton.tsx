// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function RetrySignInButton() {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      // Without redirectTo, a successful sign-in would land back on this error page.
      await signIn("google", { redirectTo: "/" });
    } catch {
      setIsPending(false);
    }
  }

  return (
    <Button className="w-full" disabled={isPending} onClick={handleClick}>
      {isPending ? "Redirecting…" : "Try again with Google"}
    </Button>
  );
}
