import { env } from "cloudflare:workers";

export async function GET() {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM notes").first<{
    count: number;
  }>();
  const listed = await env.BUCKET.list({ limit: 1000 });

  return Response.json({
    d1: {
      database: "gritroom-db",
      notes: row?.count ?? 0,
    },
    r2: {
      bucket: "gritroom",
      listed: listed.objects.length,
      truncated: listed.truncated,
    },
  });
}
