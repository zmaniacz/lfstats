// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { revalidatePath } from "next/cache";
import {
  addPlayerToCompetitionTeam,
  removePlayerFromCompetitionTeam,
  searchPlayersForRoster,
  updateCompetitionTeam,
  setPlayerMercenary,
  setCompetitionTeamLogo,
  getCompetitionById,
  getCompetitionTeamById,
  type PlayerSearchResult,
} from "@lfstats/db";
import { auth } from "@/auth";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ALLOWED_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

async function requireAdmin() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin"))
    throw new Error("Forbidden");
}

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

function getImagesBucket(): string {
  const bucket = process.env.IMAGES_BUCKET;
  if (!bucket) throw new Error("IMAGES_BUCKET is not configured");
  return bucket;
}

async function revalidateTeamPaths(competitionId: string, teamId: string): Promise<void> {
  const [comp, team] = await Promise.all([
    getCompetitionById(competitionId),
    getCompetitionTeamById(teamId),
  ]);
  if (!comp || !team) return;
  revalidatePath(`/admin/competitions/${comp.slug}/teams/${team.slug}`);
  revalidatePath(`/admin/competitions/${comp.slug}/teams`);
}

export async function updateTeamAction(
  competitionId: string,
  teamId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const name = (formData.get("name") as string).trim();
  const shortName = (formData.get("shortName") as string).trim() || null;
  if (!name) throw new Error("Team name is required");
  await updateCompetitionTeam(teamId, { competitionId, name, shortName });
  await revalidateTeamPaths(competitionId, teamId);
}

export async function addPlayerAction(
  competitionId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin();
  await addPlayerToCompetitionTeam(teamId, playerId);
  await revalidateTeamPaths(competitionId, teamId);
}

export async function removePlayerAction(
  competitionId: string,
  teamId: string,
  entryId: string,
): Promise<void> {
  await requireAdmin();
  await removePlayerFromCompetitionTeam(entryId);
  await revalidateTeamPaths(competitionId, teamId);
}

export async function setMercenaryAction(
  competitionId: string,
  teamId: string,
  playerId: string,
  isMercenary: boolean,
): Promise<void> {
  await requireAdmin();
  await setPlayerMercenary(teamId, playerId, isMercenary);
  await revalidateTeamPaths(competitionId, teamId);
}

export async function addParticipantToRosterAction(
  competitionId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin();
  await addPlayerToCompetitionTeam(teamId, playerId);
  await revalidateTeamPaths(competitionId, teamId);
}

export async function searchPlayersAction(query: string): Promise<PlayerSearchResult[]> {
  if (!query.trim()) return [];
  return searchPlayersForRoster(query.trim());
}

export async function getTeamLogoUploadUrlAction(
  competitionId: string,
  teamId: string,
  contentType: string,
): Promise<string> {
  await requireAdmin();

  if (
    !ALLOWED_LOGO_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_LOGO_CONTENT_TYPES)[number])
  ) {
    throw new Error(`Unsupported image type: ${contentType}`);
  }

  const command = new PutObjectCommand({
    Bucket: getImagesBucket(),
    Key: teamId,
    ContentType: contentType,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSignedUrl(getS3Client() as any, command, { expiresIn: 300 });
}

export async function confirmTeamLogoUploadAction(
  competitionId: string,
  teamId: string,
): Promise<void> {
  await requireAdmin();
  await setCompetitionTeamLogo(teamId, true);
  await revalidateTeamPaths(competitionId, teamId);
  revalidatePath(`/competitions/standings`);
}

export async function removeTeamLogoAction(competitionId: string, teamId: string): Promise<void> {
  await requireAdmin();
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: getImagesBucket(), Key: teamId }));
  await setCompetitionTeamLogo(teamId, false);
  await revalidateTeamPaths(competitionId, teamId);
  revalidatePath(`/competitions/standings`);
}
