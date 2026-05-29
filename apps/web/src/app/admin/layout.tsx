import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  const isAdmin = roles.some(
    (r) => r.role === "admin" || r.role === "centerAdmin",
  )
  if (!isAdmin) redirect("/")

  return (
    <div className="p-6 space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Admin</h1>
      </div>
      {children}
    </div>
  )
}
