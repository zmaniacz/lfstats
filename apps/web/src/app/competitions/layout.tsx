// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

export default function CompetitionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="p-6 space-y-6">{children}</div>
}
