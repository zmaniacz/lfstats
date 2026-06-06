// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { grantRoleAction } from "../actions"

export type GrantableRole = "superAdmin" | "admin" | "centerAdmin" | "uploader"
export type DialogUser = { id: string; name: string | null; email: string }

type Center = { id: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedUser: DialogUser | null
  users: DialogUser[]
  centers: Center[]
  actorCanGrant: GrantableRole[]
  // null = actor can assign to any center; string[] = restricted to these center IDs
  actorCenterIds: string[] | null
}

const ROLE_LABELS: Record<GrantableRole, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  centerAdmin: "Center Admin",
  uploader: "Uploader",
}

const ROLES_REQUIRING_CENTER: GrantableRole[] = ["centerAdmin", "uploader"]

export function GrantRoleDialog({
  open,
  onOpenChange,
  preselectedUser,
  users,
  centers,
  actorCanGrant,
  actorCenterIds,
}: Props) {
  const [userId, setUserId] = useState(preselectedUser?.id ?? "")
  const [role, setRole] = useState<GrantableRole | "">("")
  const [centerId, setCenterId] = useState("")
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  // Reset form when the dialog opens with a (possibly different) preselected user
  useEffect(() => {
    setUserId(preselectedUser?.id ?? "")
    setRole("")
    setCenterId("")
  }, [preselectedUser, open])

  const needsCenter =
    role !== "" && ROLES_REQUIRING_CENTER.includes(role as GrantableRole)

  const visibleCenters =
    actorCenterIds != null
      ? centers.filter((c) => actorCenterIds.includes(c.id))
      : centers

  function handleRoleChange(value: string) {
    setRole(value as GrantableRole)
    setCenterId("")
    if (
      ROLES_REQUIRING_CENTER.includes(value as GrantableRole) &&
      visibleCenters.length === 1
    ) {
      setCenterId(visibleCenters[0].id)
    }
  }

  async function handleSubmit() {
    if (!userId || !role) return
    const resolvedCenterId = needsCenter ? centerId || null : null
    setIsPending(true)
    try {
      await grantRoleAction(userId, role as GrantableRole, resolvedCenterId)
      onOpenChange(false)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  const canSubmit =
    userId !== "" && role !== "" && (!needsCenter || centerId !== "")

  const displayUser =
    preselectedUser ?? users.find((u) => u.id === userId) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grant Role</DialogTitle>
          <DialogDescription>
            Assign a role to a user, optionally scoped to a center.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {preselectedUser ? (
            <div className="space-y-1">
              <Label>User</Label>
              <p className="text-sm text-muted-foreground">
                {displayUser?.name
                  ? `${displayUser.name} (${displayUser.email})`
                  : displayUser?.email}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ? `${u.name} (${u.email})` : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select role..." />
              </SelectTrigger>
              <SelectContent>
                {actorCanGrant.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsCenter && (
            <div className="space-y-2">
              <Label>Center</Label>
              <Select value={centerId} onValueChange={setCenterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select center..." />
                </SelectTrigger>
                <SelectContent>
                  {visibleCenters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="w-full"
          >
            {isPending ? "Granting..." : "Grant Role"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
