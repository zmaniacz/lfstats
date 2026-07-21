// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTagsByCenter, getCenterBySlug } from "@lfstats/db";
import { TagsTable } from "@/components/admin/TagsTable";
import {
  createTagAction,
  updateTagAction,
  archiveTagAction,
  unarchiveTagAction,
  deleteTagAction,
  mergeTagAction,
} from "../actions";

const getCenter = cache(getCenterBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const centerRow = await getCenter(slug);
  if (!centerRow) return { title: "Admin: Center Not Found" };

  return { title: `Admin: ${centerRow.name} Tags` };
}

export default async function CenterTagsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const centerRow = await getCenter(slug);
  if (!centerRow) notFound();

  const tags = await getTagsByCenter(centerRow.id, true);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/tags" className="text-sm text-muted-foreground hover:underline">
          ← Tags
        </Link>
        <h2 className="text-xl font-semibold mt-1">{centerRow.name} — Tags</h2>
      </div>
      <TagsTable
        centerId={centerRow.id}
        tags={tags}
        createAction={createTagAction}
        updateAction={updateTagAction}
        archiveAction={archiveTagAction}
        unarchiveAction={unarchiveTagAction}
        deleteAction={deleteTagAction}
        mergeAction={mergeTagAction}
      />
    </div>
  );
}
