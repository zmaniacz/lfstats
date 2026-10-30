// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RetrySignInButton } from "./RetrySignInButton";

export const metadata: Metadata = { title: "Sign-in problem" };

// Replaces the default Auth.js error page. Auth.js reports anything it doesn't consider
// client-safe as "Configuration", including a stale or unreadable sign-in cookie in the
// user's browser, so the message can't tell them what went wrong. The cause is in the
// server logs (lib/auth-logger.ts); this page gets them signed in.
export default function AuthErrorPage() {
  return (
    <div className="flex justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>We couldn&apos;t sign you in</CardTitle>
          <CardDescription>
            Something went wrong during sign-in. Trying again usually fixes it.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          If it keeps happening, clear this site&apos;s cookies, check that your device&apos;s date
          and time are correct, or try a private window.
        </CardContent>
        <CardFooter>
          <RetrySignInButton />
        </CardFooter>
      </Card>
    </div>
  );
}
