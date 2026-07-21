// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { auth } from "@/auth";
import { getActiveCompetitionsForUpload } from "@lfstats/db";
import { UploadPage } from "./_components/UploadPage";

const ADMIN_ROLES = ["admin", "superAdmin"];

export const metadata: Metadata = { title: "Upload" };

export default async function Page() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r.role));
  const centerIds = [...new Set(roles.map((r) => r.centerId).filter((c): c is string => !!c))];

  const competitions = await getActiveCompetitionsForUpload(isAdmin ? undefined : centerIds);

  return <UploadPage competitions={competitions} />;
}
