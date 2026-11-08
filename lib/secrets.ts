import { env } from "cloudflare:workers";

export type GmailSmtpKeys = {
  "gmail-smtp-email": string;
  "gmail-smtp-host"?: string;
  "gmail-smtp-port"?: number | string;
  "gmail-smtp-password": string;
  email?: string;
  host?: string;
  port?: number | string;
  password?: string;
};

type EnvWithSecrets = typeof env & {
  "gmail-smtp-keys"?: string;
};

function secretsEnv(): EnvWithSecrets {
  return env as EnvWithSecrets;
}

export function getGmailSmtpKeys():
  | { ok: true; keys: Required<Pick<GmailSmtpKeys, never>> & {
      email: string;
      host: string;
      port: number;
      password: string;
    } }
  | { ok: false; reason: string } {
  const raw = secretsEnv()["gmail-smtp-keys"]?.trim();
  if (!raw) {
    return { ok: false, reason: "Secret gmail-smtp-keys is not set on this Worker." };
  }

  let parsed: GmailSmtpKeys;
  try {
    parsed = JSON.parse(raw) as GmailSmtpKeys;
  } catch {
    return { ok: false, reason: "Secret gmail-smtp-keys is not valid JSON." };
  }

  const email = (parsed["gmail-smtp-email"] ?? parsed.email ?? "").trim();
  const password = (parsed["gmail-smtp-password"] ?? parsed.password ?? "").trim();
  const host = (parsed["gmail-smtp-host"] ?? parsed.host ?? "smtp.gmail.com").trim();
  const portRaw = parsed["gmail-smtp-port"] ?? parsed.port ?? 465;
  const port = typeof portRaw === "string" ? Number.parseInt(portRaw, 10) : portRaw;

  if (!email || !password) {
    return {
      ok: false,
      reason: "gmail-smtp-keys must include gmail-smtp-email and gmail-smtp-password.",
    };
  }
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, reason: "gmail-smtp-port must be a positive number." };
  }

  return {
    ok: true,
    keys: { email, host, port, password },
  };
}
