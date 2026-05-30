"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { UserWithRoles } from "@lfstats/db"
import { GrantRoleDialog, type GrantableRole, type DialogUser } from "./GrantRoleDialog"
import { RevokeRoleButton } from "./RevokeRoleButton"

type Center = { id: string; name: string }
type ActorRole = { role: string; centerId: string | null }

type Props = {
  users: UserWithRoles[]
  allUsers: DialogUser[]
  centers: Center[]
  actorCanGrant: GrantableRole[]
  actorCenterIds: string[] | null
  actorRoles: ActorRole[]
}

const ROLE_ORDER: Record<string, number> = {
  superAdmin: 0,
  admin: 1,
  centerAdmin: 2,
  uploader: 3,
}

const ROLE_LABELS: Record<string, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  centerAdmin: "Center Admin",
  uploader: "Uploader",
}

function userPriority(user: UserWithRoles): number {
  if (user.roles.length === 0) return 4
  return Math.min(...user.roles.map((r) => ROLE_ORDER[r.role] ?? 5))
}

function canRevokeRole(
  actorRoles: ActorRole[],
  targetRole: string,
  targetCenterId: string | null,
): boolean {
  const isSuperAdmin = actorRoles.some((r) => r.role === "superAdmin")
  const isAdminOrAbove = actorRoles.some(
    (r) => r.role === "superAdmin" || r.role === "admin",
  )
  if (targetRole === "superAdmin" || targetRole === "admin") return isSuperAdmin
  if (targetRole === "centerAdmin") return isAdminOrAbove
  if (targetRole === "uploader") {
    if (isAdminOrAbove) return true
    const centerAdminIds = actorRoles
      .filter((r) => r.role === "centerAdmin" && r.centerId != null)
      .map((r) => r.centerId!)
    return targetCenterId != null && centerAdminIds.includes(targetCenterId)
  }
  return false
}

export function UsersTableClient({
  users,
  allUsers,
  centers,
  actorCanGrant,
  actorCenterIds,
  actorRoles,
}: Props) {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogUser, setDialogUser] = useState<DialogUser | null>(null)

  function openGrantDialog(user: DialogUser) {
    setDialogUser(user)
    setDialogOpen(true)
  }

  const q = search.toLowerCase()
  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(q) ||
      (u.name?.toLowerCase().includes(q) ?? false),
  )

  const sorted = [...filtered].sort((a, b) => userPriority(a) - userPriority(b))

  return (
    <>
      <Input
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Roles</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                {user.name ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  {user.roles.length === 0 && (
                    <span className="text-muted-foreground text-sm">
                      No roles
                    </span>
                  )}
                  {user.roles.map((r) => {
                    const revocable = canRevokeRole(
                      actorRoles,
                      r.role,
                      r.centerId,
                    )
                    const centerLabel = r.centerShortName ?? r.centerName
                    const revokeSummary =
                      ROLE_LABELS[r.role] +
                      (centerLabel ? ` @ ${centerLabel}` : "")
                    return (
                      <div key={r.id} className="flex items-center gap-1">
                        <Badge variant="secondary">
                          {ROLE_LABELS[r.role] ?? r.role}
                        </Badge>
                        {centerLabel && (
                          <Badge variant="outline">{centerLabel}</Badge>
                        )}
                        {revocable && (
                          <RevokeRoleButton
                            roleId={r.id}
                            label={revokeSummary}
                          />
                        )}
                      </div>
                    )
                  })}
                  {actorCanGrant.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        openGrantDialog({
                          id: user.id,
                          name: user.name,
                          email: user.email,
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="sr-only">Grant role to {user.email}</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground py-8"
              >
                {search ? "No users match your search." : "No users found."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <GrantRoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preselectedUser={dialogUser}
        users={allUsers}
        centers={centers}
        actorCanGrant={actorCanGrant}
        actorCenterIds={actorCenterIds}
      />
    </>
  )
}
