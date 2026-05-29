import { notFound } from "next/navigation"
import Link from "next/link"
import { getTagsByCenter, getCenterById } from "@lfstats/db"
import { TagsTable } from "@/components/admin/TagsTable"
import {
  createTagAction,
  updateTagAction,
  archiveTagAction,
  unarchiveTagAction,
  deleteTagAction,
  mergeTagAction,
} from "../actions"

export default async function CenterTagsPage({
  params,
}: {
  params: Promise<{ centerId: string }>
}) {
  const { centerId } = await params

  const centerRow = await getCenterById(centerId)
  if (!centerRow) notFound()

  const tags = await getTagsByCenter(centerId, true)

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/tags"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Tags
        </Link>
        <h2 className="text-xl font-semibold mt-1">{centerRow.name} — Tags</h2>

      </div>
      <TagsTable
        centerId={centerId}
        tags={tags}
        createAction={createTagAction}
        updateAction={updateTagAction}
        archiveAction={archiveTagAction}
        unarchiveAction={unarchiveTagAction}
        deleteAction={deleteTagAction}
        mergeAction={mergeTagAction}
      />
    </div>
  )
}
