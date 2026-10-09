import { proxyTryon } from "@/lib/catvton-server";
import { connection } from "next/server";

export async function POST(request: Request) {
  await connection();
  try {
    return await proxyTryon(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The try-on backend is not reachable.";
    return Response.json({ error: message }, { status: 503 });
  }
}
