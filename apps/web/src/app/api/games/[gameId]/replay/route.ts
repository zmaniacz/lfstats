import { NextResponse } from "next/server";
import { getGameReplayData } from "@lfstats/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const data = await getGameReplayData(gameId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
