import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import {
  db,
  authUser,
  authAccount,
  authSession,
  authVerificationToken,
  getUserRoles,
} from "@lfstats/db";

const UPLOAD_PATHS = ["/upload", "/api/upload"];
const UPLOAD_ROLES = ["admin", "centerAdmin", "uploader"];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: authUser,
    accountsTable: authAccount,
    sessionsTable: authSession,
    verificationTokensTable: authVerificationToken,
  }),
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const roles = await getUserRoles(user.id);
        token.userId = user.id;
        token.roles = roles.map((r) => ({
          role: r.role,
          centerId: r.centerId,
        }));
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.roles = token.roles as Array<{
        role: "admin" | "centerAdmin" | "uploader";
        centerId: string | null;
      }>;
      return session;
    },
    authorized({ auth: session, request: { nextUrl } }) {
      const isUploadRoute = UPLOAD_PATHS.some((p) =>
        nextUrl.pathname.startsWith(p),
      );
      if (!isUploadRoute) return true;

      const isApiRoute = nextUrl.pathname.startsWith("/api/");

      if (!session) {
        if (isApiRoute) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return false; // NextAuth redirects to sign-in
      }

      const roles = session.user.roles ?? [];
      const hasRole = roles.some((r) => UPLOAD_ROLES.includes(r.role));
      if (!hasRole) {
        if (isApiRoute) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
  },
});
