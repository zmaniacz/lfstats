// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyableCode } from "./CopyableCode";

// How to connect an MCP client to /mcp. Every client listed here signs in through LFstats'
// OAuth flow (dynamic client registration, PKCE), so the server URL is all a user needs —
// no API key. Client menus move often: keep each entry short, and link the vendor's own
// help page for the chat apps, whose menus change the most.

type Client = {
  id: string;
  name: string;
  body: (url: string) => ReactNode;
};

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-sm">{children}</ol>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function Help({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </a>
  );
}

const CLIENTS: Client[] = [
  {
    id: "claude",
    name: "Claude",
    body: () => (
      <>
        <Steps>
          <li>
            On claude.ai or in the Claude desktop app, open <strong>Customize → Connectors</strong>.
          </li>
          <li>
            Click <strong>+ Add → Add custom connector</strong>, name it <em>LFstats</em>, paste the
            server URL and click <strong>Continue</strong>. Keep the default sign-in settings and
            click <strong>Add</strong>.
          </li>
          <li>Connect it, sign in to LFstats when asked, and approve access.</li>
          <li>
            In a chat, turn it on from <strong>+ → Connectors</strong>.
          </li>
        </Steps>
        <Note>
          Works on every Claude plan; the free plan allows one custom connector. Once added, it is
          also available in the Claude mobile app.{" "}
          <Help href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">
            Claude help
          </Help>
        </Note>
      </>
    ),
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    body: () => (
      <>
        <Steps>
          <li>
            Turn on <strong>Developer mode</strong> in{" "}
            <strong>Settings → Apps → Advanced settings</strong>. In a workspace, an admin may have
            to allow it first.
          </li>
          <li>
            Create an app, paste the server URL, and choose <strong>OAuth</strong> for
            authentication.
          </li>
          <li>Sign in to LFstats when asked and approve access, then pick the app in a chat.</li>
        </Steps>
        <Note>
          Custom MCP apps need developer mode, which is limited to some ChatGPT plans, and OpenAI
          moves these menus often.{" "}
          <Help href="https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta">
            OpenAI help
          </Help>
        </Note>
      </>
    ),
  },
  {
    id: "gemini",
    name: "Gemini",
    body: () => (
      <>
        <Steps>
          <li>
            On gemini.google.com, open <strong>Settings → Connected Apps</strong>.
          </li>
          <li>
            Under <strong>Custom apps</strong>, click <strong>Add a custom app</strong>, paste the
            server URL and click <strong>Next</strong>.
          </li>
          <li>Sign in to LFstats when asked and approve access.</li>
        </Steps>
        <Note>
          Google currently limits custom apps to personal Google accounts in the US, aged 18+, with
          Keep Activity on. Add it on the web; it then works in the mobile app too.{" "}
          <Help href="https://support.google.com/gemini/answer/17209137">Gemini help</Help>
        </Note>
      </>
    ),
  },
  {
    id: "claude-code",
    name: "Claude Code",
    body: (url) => (
      <>
        <p className="text-sm">
          Add the server, then run <code>/mcp</code> in Claude Code and pick LFstats to sign in.
        </p>
        <CopyableCode
          value={`claude mcp add --transport http lfstats ${url}`}
          label="Copy command"
        />
      </>
    ),
  },
  {
    id: "vscode",
    name: "VS Code",
    body: (url) => (
      <>
        <p className="text-sm">
          Run <strong>MCP: Add Server</strong> from the Command Palette, choose{" "}
          <strong>HTTP</strong> and paste the URL, or add this to <code>.vscode/mcp.json</code>. VS
          Code asks you to sign in the first time a tool runs.
        </p>
        <CopyableCode
          multiline
          label="Copy config"
          value={JSON.stringify({ servers: { lfstats: { type: "http", url } } }, null, 2)}
        />
      </>
    ),
  },
  {
    id: "cursor",
    name: "Cursor",
    body: (url) => (
      <>
        <p className="text-sm">
          Add this to <code>~/.cursor/mcp.json</code>, then click the sign-in prompt next to LFstats
          in Cursor&apos;s MCP settings.
        </p>
        <CopyableCode
          multiline
          label="Copy config"
          value={JSON.stringify({ mcpServers: { lfstats: { url } } }, null, 2)}
        />
      </>
    ),
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    body: (url) => (
      <>
        <p className="text-sm">
          Add this to <code>~/.gemini/settings.json</code>, restart Gemini CLI, and run{" "}
          <code>/mcp auth lfstats</code> to sign in.
        </p>
        <CopyableCode
          multiline
          label="Copy config"
          value={JSON.stringify({ mcpServers: { lfstats: { httpUrl: url } } }, null, 2)}
        />
      </>
    ),
  },
  {
    id: "other",
    name: "Other",
    body: () => (
      <p className="text-sm">
        Any client that supports remote MCP servers over Streamable HTTP with OAuth sign-in can
        connect with the URL alone; LFstats registers the client automatically. If your client can
        only send a fixed header, ask an LFstats admin for an API key and send it as{" "}
        <code>Authorization: Bearer lfs_…</code>.
      </p>
    ),
  },
];

export function McpSetupGuide({ mcpUrl }: { mcpUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect an AI assistant</CardTitle>
        <CardDescription>
          LFstats has an MCP server, so assistants like Claude, ChatGPT and Gemini can answer
          questions about games, players and leaderboards. Add this server URL to your app; it sends
          you here to sign in and approve access, and no API key is needed. Access is read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CopyableCode value={mcpUrl} label="Copy server URL" />
        <Tabs defaultValue="claude">
          <TabsList className="flex-wrap group-data-horizontal/tabs:h-auto">
            {CLIENTS.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {CLIENTS.map((c) => (
            <TabsContent key={c.id} value={c.id} className="mt-3 space-y-3">
              {c.body(mcpUrl)}
            </TabsContent>
          ))}
        </Tabs>
        <p className="text-sm text-muted-foreground">
          Then just ask, for example: &ldquo;Who are the top 5 medics by average MVP at
          Syracuse?&rdquo; or &ldquo;Compare Brew and Beanz over the last year.&rdquo;
        </p>
      </CardContent>
    </Card>
  );
}
