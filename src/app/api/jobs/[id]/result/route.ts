import { proxyResult } from "@/lib/catvton-server";
import { connection } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  try {
    return await proxyResult(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The try-on backend is not reachable.";
    return Response.json({ error: message }, { status: 503 });
  }
}
