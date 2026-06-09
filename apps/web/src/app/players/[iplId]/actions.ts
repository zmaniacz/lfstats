// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import { addFavoritePlayer, removeFavoritePlayer } from "@lfstats/db";
import { revalidatePath } from "next/cache";

export async function addFavoritePlayerAction(iplId: string, playerId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await addFavoritePlayer(session.user.id, playerId);
  revalidatePath(`/players/${iplId}`);
}

export async function removeFavoritePlayerAction(iplId: string, playerId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await removeFavoritePlayer(session.user.id, playerId);
  revalidatePath(`/players/${iplId}`);
}
