// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YoutubeEmbed } from "@/components/video/YoutubeEmbed";
import { parseYoutubeVideoId, youtubeWatchUrl } from "@/lib/youtube";
import type { GameVideo } from "@lfstats/db";

export type VideoRosterEntry = {
  playerId: string;
  callsign: string;
};

type Props = {
  /** The game a newly added video attaches to. */
  gameId: string;
  videos: GameVideo[];
  /** Roster for the POV player picker; guests (no playerId) are excluded upstream. */
  roster: VideoRosterEntry[];
  canEdit: boolean;
  addAction: (gameId: string, formData: FormData) => Promise<void>;
  removeAction: (gameId: string, videoId: string) => Promise<void>;
  updateAction: (
    gameId: string,
    videoId: string,
    formData: FormData,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Laserball only: gameId → "Half 1" / "Overtime", for match views spanning games. */
  gameLabels?: Map<string, string>;
};

export function VideoManager({
  gameId,
  videos,
  roster,
  canEdit,
  addAction,
  removeAction,
  updateAction,
  gameLabels,
}: Props) {
  const [dialogMode, setDialogMode] = useState<"game" | "pov" | "edit" | null>(null);
  const [editing, setEditing] = useState<GameVideo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GameVideo | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [playerId, setPlayerId] = useState("");

  const gameVideos = videos.filter((v) => v.playerId === null);
  const povVideos = videos.filter((v) => v.playerId !== null);

  const povByPlayer = new Map<string, { callsign: string; videos: GameVideo[] }>();
  for (const v of povVideos) {
    const key = v.playerId!;
    if (!povByPlayer.has(key)) {
      povByPlayer.set(key, { callsign: v.callsign ?? "Unknown", videos: [] });
    }
    povByPlayer.get(key)!.videos.push(v);
  }

  function openDialog(mode: "game" | "pov") {
    setUrl("");
    setLabel("");
    setPlayerId("");
    setEditing(null);
    setError(null);
    setDialogMode(mode);
  }

  function openEditDialog(video: GameVideo) {
    setUrl(video.youtubeUrl);
    setLabel(video.label ?? "");
    setPlayerId("");
    setEditing(video);
    setError(null);
    setDialogMode("edit");
  }

  async function handleSubmit() {
    if (!parseYoutubeVideoId(url)) {
      setError("That doesn't look like a YouTube video URL.");
      return;
    }
    if (dialogMode === "pov" && !playerId) {
      setError("Pick a player for this POV video.");
      return;
    }

    const formData = new FormData();
    formData.set("youtubeUrl", url.trim());
    formData.set("label", label.trim());
    if (dialogMode === "pov") formData.set("playerId", playerId);

    setIsPending(true);

    // Editing can fail on a recoverable conflict, so it keeps the dialog open
    // and shows why instead of resetting past the error.
    if (dialogMode === "edit" && editing) {
      const result = await updateAction(gameId, editing.id, formData);
      if (!result.ok) {
        setError(result.error);
        setIsPending(false);
        return;
      }
      setDialogMode(null);
      setEditing(null);
      setUrl("");
      setLabel("");
      setPlayerId("");
      setError(null);
      setIsPending(false);
      return;
    }

    try {
      await addAction(gameId, formData);
      setDialogMode(null);
      setEditing(null);
      setUrl("");
      setLabel("");
      setPlayerId("");
      setError(null);
    } finally {
      setIsPending(false);
    }
  }

  async function handleRemove(videoId: string) {
    setIsPending(true);
    try {
      await removeAction(gameId, videoId);
      setDeleteTarget(null);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Game Videos</CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => openDialog("game")}>
              + Add Game Video
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {gameVideos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No game videos yet. Scoreboard and arena-cam recordings show up here.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gameVideos.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  canEdit={canEdit}
                  isPending={isPending}
                  onEdit={openEditDialog}
                  onRequestDelete={setDeleteTarget}
                  halfLabel={gameLabels?.get(v.gameId)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Player POV</CardTitle>
          {canEdit && roster.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => openDialog("pov")}>
              + Add POV Video
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {povByPlayer.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              No player POV videos yet. These are recordings from a single player&apos;s
              perspective.
            </p>
          ) : (
            <div className="space-y-6">
              {Array.from(povByPlayer.entries()).map(([pid, group]) => (
                <section key={pid} className="space-y-2">
                  <h3 className="text-sm font-semibold">{group.callsign}</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.videos.map((v) => (
                      <VideoCard
                        key={v.id}
                        video={v}
                        canEdit={canEdit}
                        isPending={isPending}
                        onEdit={openEditDialog}
                        onRequestDelete={setDeleteTarget}
                        halfLabel={gameLabels?.get(v.gameId)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit"
                ? "Edit Video"
                : dialogMode === "pov"
                  ? "Add Player POV Video"
                  : "Add Game Video"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "edit"
                ? editing?.callsign
                  ? `POV footage for ${editing.callsign}. Change the link or label — to move it to another player, remove it and add it again.`
                  : "Change the link or label for this game video."
                : dialogMode === "pov"
                  ? "Link a YouTube recording from one player's perspective."
                  : "Link a YouTube recording of the game, such as a scoreboard or arena cam."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialogMode === "pov" && (
              <div className="space-y-2">
                <Label>Player</Label>
                <Select value={playerId} onValueChange={setPlayerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select player..." />
                  </SelectTrigger>
                  <SelectContent>
                    {roster.map((p) => (
                      <SelectItem key={p.playerId} value={p.playerId}>
                        {p.callsign}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="youtubeUrl">YouTube URL</Label>
              <Input
                id="youtubeUrl"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://youtu.be/..."
              />
              <p className="text-xs text-muted-foreground">
                A start time in the URL (YouTube&apos;s &ldquo;Share at current time&rdquo;) is
                kept, so links into a long recording land on this game. Re-adding a video already
                listed here updates it.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={dialogMode === "pov" ? "e.g. Red Commander POV" : "e.g. Arena Cam 2"}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleSubmit} disabled={isPending || !url} className="w-full">
              {isPending ? "Saving…" : dialogMode === "edit" ? "Save Changes" : "Add Video"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove &ldquo;{deleteTarget.label ?? "Untitled video"}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget.callsign
                  ? `This removes the POV video linked to ${deleteTarget.callsign} from this game. The video stays on YouTube.`
                  : "This removes the video link from this game. The video stays on YouTube."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleRemove(deleteTarget.id)}
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function VideoCard({
  video,
  canEdit,
  isPending,
  onEdit,
  onRequestDelete,
  halfLabel,
}: {
  video: GameVideo;
  canEdit: boolean;
  isPending: boolean;
  onEdit: (video: GameVideo) => void;
  onRequestDelete: (video: GameVideo) => void;
  halfLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <YoutubeEmbed
        videoId={video.youtubeVideoId}
        startSeconds={video.startSeconds}
        label={video.label}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm truncate">{video.label ?? "Untitled video"}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={youtubeWatchUrl(video.youtubeVideoId, video.startSeconds)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline"
            >
              YouTube ↗
            </a>
            {halfLabel && (
              <Badge variant="secondary" className="text-xs px-1 py-0">
                {halfLabel}
              </Badge>
            )}
            {video.source === "api" && (
              <Badge variant="outline" className="text-xs px-1 py-0">
                Auto
              </Badge>
            )}
          </div>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={isPending} title="Video options">
                ⋯
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(video)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onRequestDelete(video)}>
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
