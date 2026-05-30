# LFstats Role Specification

## Overview

LFstats uses a four-level role hierarchy stored in the `user_roles` table. A user may hold multiple roles, including roles scoped to specific centers via `center_id`. Global roles have `center_id = null`.

Users must sign in with Google OAuth before any role can be assigned to them.

---

## Roles

### `superAdmin`

Full control with no restrictions.

- Access all admin panels (`/admin`, `/upload`)
- Create, edit, and delete any game, competition, or tag at any center
- Grant or revoke any role, including `admin` and `superAdmin`
- Manage users at any center

### `admin`

Full editorial access, cannot elevate other users to `admin` or `superAdmin`.

- Access all admin panels (`/admin`, `/upload`)
- Create, edit, and delete any game, competition, or tag at any center
- Grant `centerAdmin` and `uploader` roles (at any center)
- Revoke `centerAdmin` and `uploader` roles (at any center)
- Cannot grant or revoke `admin` or `superAdmin` roles

### `centerAdmin`

Scoped to one or more assigned centers. Cannot manage other admin-level roles.

- Access `/admin` and `/upload` panels
- Create, edit, and delete games, competitions, and tags **only at their assigned center(s)**
- Grant `uploader` role **only at their assigned center(s)**
- Revoke `uploader` role **only at their assigned center(s)**
- Cannot grant or revoke `centerAdmin`, `admin`, or `superAdmin` roles
- Sees only users relevant to their center(s) in the user admin panel

### `uploader`

Upload-only access. No admin panels.

- Access `/upload` panel only
- Upload TDF files for ingestion
- No access to `/admin` or any management features

---

## Permissions Matrix

| Action | superAdmin | admin | centerAdmin | uploader |
|---|---|---|---|---|
| Access `/upload` | ✓ | ✓ | ✓ | ✓ |
| Access `/admin` | ✓ | ✓ | ✓ | ✗ |
| Edit games/competitions/tags (any center) | ✓ | ✓ | own center only | ✗ |
| Grant `superAdmin` | ✓ | ✗ | ✗ | ✗ |
| Grant `admin` | ✓ | ✗ | ✗ | ✗ |
| Grant `centerAdmin` | ✓ | ✓ (any center) | ✗ | ✗ |
| Grant `uploader` | ✓ | ✓ (any center) | ✓ (own center only) | ✗ |
| Revoke `superAdmin` / `admin` | ✓ | ✗ | ✗ | ✗ |
| Revoke `centerAdmin` | ✓ | ✓ | ✗ | ✗ |
| Revoke `uploader` | ✓ | ✓ (any center) | ✓ (own center only) | ✗ |
| View user admin panel | ✓ | ✓ | ✓ (filtered) | ✗ |

---

## Center Scoping

The `user_roles` table has a nullable `center_id` column:

- `center_id = null` — the role applies globally (used for `superAdmin`, `admin`)
- `center_id = <uuid>` — the role is scoped to that specific center (used for `centerAdmin`, `uploader`)

A user can hold the same role at multiple centers (e.g., `uploader` at Center A and Center B).

When a `centerAdmin` manages competitions or tags, the system checks that the resource's `center_id` matches one of the centers in the actor's `centerAdmin` role assignments.
