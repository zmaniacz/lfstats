import type { DefaultSession } from "next-auth";

type UserRoleEntry = {
  role: "admin" | "centerAdmin" | "uploader";
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
