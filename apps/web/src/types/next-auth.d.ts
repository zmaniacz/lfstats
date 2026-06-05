// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { DefaultSession } from "next-auth";

type UserRoleEntry = {
  role: "admin" | "centerAdmin" | "uploader" | "superAdmin";
  centerId: string | null;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: UserRoleEntry[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    roles: UserRoleEntry[];
  }
}
