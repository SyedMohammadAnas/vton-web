import { proxyCancel } from "@/lib/catvton-server";
import { connection } from "next/server";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  try {
    return await proxyCancel(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The try-on backend is not reachable.";
    return Response.json({ error: message }, { status: 503 });
  }
}
