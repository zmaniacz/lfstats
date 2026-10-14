// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { describeRedirect } from "@/lib/oauth/describe-redirect";
import { siteOrigin, validateAuthorizeRequest } from "@/lib/oauth/server";

export const metadata: Metadata = { title: "Connect an app" };

// The OAuth authorization endpoint for /mcp (docs/Query_API_Spec.md "OAuth"). Signs the
// user in with the site's Google login if needed, then asks them to approve the client.
// The approval form posts to ./decision, which validates the request again.
//
// Deliberately no loading.tsx: its Suspense boundary makes Next stream a 200 first, which
// turns the redirect() of a protocol error into a client-side redirect. OAuth clients
// expect a real HTTP redirect, so this page renders without a boundary.

const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "state",
  "resource",
] as const;

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center p-6">{children}</div>;
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const name of AUTHORIZE_PARAMS) {
    const value = raw[name];
    if (typeof value === "string") params.set(name, value);
  }

  const origin = await siteOrigin();
  const validation = await validateAuthorizeRequest(params, origin);
  if (validation.kind === "redirect") redirect(validation.url);
  if (validation.kind === "fatal") {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Can&apos;t connect this app</CardTitle>
            <CardDescription>{validation.message}</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }
  const { client, redirectUri } = validation.request;
  const appName = client.clientName ?? "An app";
  const returnTo = `/oauth/authorize?${params.toString()}`;

  const session = await auth();
  if (!session?.user?.id) {
    async function signInWithGoogle() {
      "use server";
      await signIn("google", { redirectTo: returnTo });
    }
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in to LFstats</CardTitle>
            <CardDescription>
              {appName} wants to read LFstats data for you. Sign in with your Google account to
              continue.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <form action={signInWithGoogle} className="w-full">
              <Button type="submit" className="w-full">
                Sign in with Google
              </Button>
            </form>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Allow {appName} to use LFstats?</CardTitle>
          <CardDescription>Signed in as {session.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            It will be able to <strong>read</strong> LFstats game, player and competition stats on
            your behalf. It can&apos;t change anything.
          </p>
          <p className="text-muted-foreground">
            You&apos;ll be returned to {describeRedirect(redirectUri)}. Only allow apps you started
            connecting yourself. You can disconnect it any time from{" "}
            <Link href="/account/connected-apps" className="underline">
              Connected apps
            </Link>
            .
          </p>
        </CardContent>
        <CardFooter>
          <form method="post" action="/oauth/authorize/decision" className="flex w-full gap-2">
            {[...params].map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
              Deny
            </Button>
            <Button type="submit" name="decision" value="allow" className="flex-1">
              Allow
            </Button>
          </form>
        </CardFooter>
      </Card>
    </Shell>
  );
}
