// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import { updateCenter } from "@lfstats/db";
import { revalidatePath } from "next/cache";

async function requireCenterAdmin(centerId: string) {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const ok = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === centerId),
  );
  if (!ok) throw new Error("Forbidden");
}

export async function updateCenterAction(id: string, formData: FormData) {
  await requireCenterAdmin(id);

  const name = formData.get("name") as string;
  const shortName = (formData.get("shortName") as string) || null;
  const city = (formData.get("city") as string) || null;
  const countryName = (formData.get("countryName") as string) || null;
  const timezone = (formData.get("timezone") as string) || null;

  await updateCenter(id, { name, shortName, city, countryName, timezone });
  revalidatePath("/admin/centers", "layout");
}
