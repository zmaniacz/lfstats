import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function PlayersLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-60" />
      </div>
      <TableSkeleton />
      <TableSkeleton />
      <TableSkeleton />
      <TableSkeleton />
      <TableSkeleton />
      <TableSkeleton />
    </div>
  )
}
