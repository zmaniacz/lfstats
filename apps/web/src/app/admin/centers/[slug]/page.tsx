// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCenterBySlug } from "@lfstats/db";
import { CenterEditForm } from "@/components/admin/CenterEditForm";
import { updateCenterAction } from "../actions";

const getCenter = cache(getCenterBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const centerRow = await getCenter(slug);
  if (!centerRow) return { title: "Admin: Center Not Found" };
  return { title: `Admin: ${centerRow.name}` };
}

export default async function CenterEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const centerRow = await getCenter(slug);
  if (!centerRow) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/centers" className="text-sm text-muted-foreground hover:underline">
          ← Centers
        </Link>
        <h2 className="text-xl font-semibold mt-1">{centerRow.name}</h2>
        <p className="text-sm text-muted-foreground">Slug: {centerRow.slug}</p>
      </div>
      <CenterEditForm center={centerRow} updateAction={updateCenterAction} />
    </div>
  );
}
