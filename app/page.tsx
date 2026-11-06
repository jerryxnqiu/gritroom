import { env } from "cloudflare:workers";

const links = [
  {
    href: "https://github.com/cloudflare/vinext",
    label: "vinext",
  },
  {
    href: "https://developers.cloudflare.com/workers/",
    label: "Workers",
  },
];

type Status =
  | { ok: true; notes: number; objects: number; truncated: boolean }
  | { ok: false; message: string };

async function readStatus(): Promise<Status> {
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM notes").first<{
      count: number;
    }>();
    const listed = await env.BUCKET.list({ limit: 1000 });
    return {
      ok: true,
      notes: row?.count ?? 0,
      objects: listed.objects.length,
      truncated: listed.truncated,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The D1 or R2 binding request failed.",
    };
  }
}

export default async function Home() {
  const status = await readStatus();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <section className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
            Next.js on Cloudflare Workers
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
            Gritroom is connected to D1 and R2.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-700">
            This App Router app deploys as a Worker. Database schema lives in{" "}
            <code>migrations/</code>, and file storage uses the <code>gritroom</code> bucket.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">D1 · gritroom-db</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Binding <code>DB</code>. The <code>notes</code> table is created by{" "}
              <code>migrations/0001_init.sql</code>.
            </p>
            <p className="mt-4 text-2xl font-semibold">
              {status.ok ? status.notes : "—"}
              <span className="ml-2 text-sm font-normal text-slate-500">notes</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">R2 · gritroom</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Binding <code>BUCKET</code>. Objects stay in the bucket across deploys.
            </p>
            <p className="mt-4 text-2xl font-semibold">
              {status.ok ? status.objects : "—"}
              <span className="ml-2 text-sm font-normal text-slate-500">
                {status.ok && status.truncated ? "objects listed, more remain" : "objects listed"}
              </span>
            </p>
          </div>
        </div>

        {status.ok ? null : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {status.message} For local development, run <code>npm run db:migrate:local</code>.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Develop</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Run the app locally in the Workers runtime.</p>
            <code className="mt-4 block rounded bg-slate-100 px-3 py-2 text-sm">npm run dev</code>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Build</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Create the Worker production output.</p>
            <code className="mt-4 block rounded bg-slate-100 px-3 py-2 text-sm">npm run build</code>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Deploy</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Apply D1 migrations, then publish the Worker.</p>
            <code className="mt-4 block rounded bg-slate-100 px-3 py-2 text-sm">npm run deploy</code>
          </div>
        </div>

        <nav className="flex flex-wrap gap-3">
          {links.map((link) => (
            <a
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
              href={link.href}
              key={link.href}
              rel="noreferrer"
              target="_blank"
            >
              {link.label}
            </a>
          ))}
          <a
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
            href="/api/hello"
          >
            API route
          </a>
        </nav>
      </section>
    </main>
  );
}
