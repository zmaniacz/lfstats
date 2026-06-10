// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

const LOGO_BUCKET = "lfstats-modern-images";

export function getTeamLogoUrl(teamId: string): string {
  return `https://${LOGO_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${teamId}`;
}
