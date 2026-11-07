import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "46f083ef876410a58207744afe7969d3",
  worker: defineWorker({
    name: "gritroom",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-06",
    compatibilityFlags: ["nodejs_compat"],
    observability: {
      enabled: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 1 },
    },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({
        name: "gritroom-db",
        id: "bd30feba-b7bc-456a-9a71-600c1941d608",
      }),
      BUCKET: bindings.r2({ name: "gritroom" }),
      // Values live in Worker Secrets — not in git.
      // Dashboard names must match these binding keys exactly.
      "gmail-smtp-keys": bindings.secret(),
      "deepseek-api-key": bindings.secret(),
    },
  }),
});
