import { connect } from "cloudflare:sockets";

import { createId } from "./ids";
import { getGmailSmtpKeys } from "./secrets";
import { nowIso } from "./time";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  purpose: string;
  db: D1Database;
};

type SmtpResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string; stage: "config" | "connect" | "auth" | "send" };

async function readResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("\r\n") && !/^\d{3}-/m.test(buffer.split("\r\n").filter(Boolean).at(-1) ?? "")) {
      const lines = buffer.split("\r\n").filter(Boolean);
      const last = lines.at(-1) ?? "";
      if (/^\d{3} /.test(last)) break;
    }
  }
  return buffer;
}

async function expectCode(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  code: number,
  command?: string,
): Promise<string> {
  if (command) {
    await writer.write(new TextEncoder().encode(`${command}\r\n`));
  }
  const response = await readResponse(reader);
  if (!response.startsWith(String(code)) && !response.split("\r\n").some((line) => line.startsWith(String(code)))) {
    throw new Error(`Expected SMTP ${code}, got: ${response.trim().slice(0, 200)}`);
  }
  return response;
}

function toBase64(value: string): string {
  return btoa(value);
}

export async function sendEmail(input: SendEmailInput): Promise<SmtpResult> {
  const configured = getGmailSmtpKeys();
  if (!configured.ok) {
    await input.db
      .prepare(
        `INSERT INTO email_send_log (id, purpose, to_email, status, detail, created_at)
         VALUES (?, ?, ?, 'failed', ?, ?)`,
      )
      .bind(createId("eml"), input.purpose, input.to, configured.reason, nowIso())
      .run();
    return { ok: false, reason: configured.reason, stage: "config" };
  }

  const { email, host, port, password } = configured.keys;
  const messageId = `<${createId("msg")}@gritroom.local>`;
  const date = new Date().toUTCString();
  const payload = [
    `From: GritRoom <${email}>`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    "",
    ".",
  ].join("\r\n");

  let socket: ReturnType<typeof connect> | undefined;
  try {
    const secureTransport = port === 465 ? "on" : port === 587 ? "starttls" : "off";
    socket = connect({ hostname: host, port }, { secureTransport, allowHalfOpen: true });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    await expectCode(reader, writer, 220);
    await expectCode(reader, writer, 250, `EHLO gritroom.workers.dev`);

    if (secureTransport === "starttls") {
      await expectCode(reader, writer, 220, "STARTTLS");
      await writer.releaseLock();
      reader.releaseLock();
      await socket.startTls();
      const secureWriter = socket.writable.getWriter();
      const secureReader = socket.readable.getReader();
      await expectCode(secureReader, secureWriter, 250, `EHLO gritroom.workers.dev`);
      await expectCode(secureReader, secureWriter, 334, "AUTH LOGIN");
      await expectCode(secureReader, secureWriter, 334, toBase64(email));
      await expectCode(secureReader, secureWriter, 235, toBase64(password));
      await expectCode(secureReader, secureWriter, 250, `MAIL FROM:<${email}>`);
      await expectCode(secureReader, secureWriter, 250, `RCPT TO:<${input.to}>`);
      await expectCode(secureReader, secureWriter, 354, "DATA");
      await expectCode(secureReader, secureWriter, 250, payload);
      await expectCode(secureReader, secureWriter, 221, "QUIT");
      await secureWriter.close().catch(() => undefined);
      secureReader.releaseLock();
    } else {
      await expectCode(reader, writer, 334, "AUTH LOGIN");
      await expectCode(reader, writer, 334, toBase64(email));
      await expectCode(reader, writer, 235, toBase64(password));
      await expectCode(reader, writer, 250, `MAIL FROM:<${email}>`);
      await expectCode(reader, writer, 250, `RCPT TO:<${input.to}>`);
      await expectCode(reader, writer, 354, "DATA");
      await expectCode(reader, writer, 250, payload);
      await expectCode(reader, writer, 221, "QUIT");
      await writer.close().catch(() => undefined);
      reader.releaseLock();
    }

    await input.db
      .prepare(
        `INSERT INTO email_send_log (id, purpose, to_email, status, detail, created_at)
         VALUES (?, ?, ?, 'accepted', ?, ?)`,
      )
      .bind(createId("eml"), input.purpose, input.to, messageId, nowIso())
      .run();

    return { ok: true, messageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "SMTP send failed.";
    const stage = /AUTH|235|534|535/i.test(reason) ? "auth" : /connect|TCP|proxy/i.test(reason) ? "connect" : "send";
    await input.db
      .prepare(
        `INSERT INTO email_send_log (id, purpose, to_email, status, detail, created_at)
         VALUES (?, ?, ?, 'failed', ?, ?)`,
      )
      .bind(createId("eml"), input.purpose, input.to, reason.slice(0, 500), nowIso())
      .run();
    return { ok: false, reason, stage };
  } finally {
    try {
      await socket?.close();
    } catch {
      // ignore close errors
    }
  }
}

export async function checkGmailConnection(db: D1Database): Promise<SmtpResult> {
  const configured = getGmailSmtpKeys();
  if (!configured.ok) {
    return { ok: false, reason: configured.reason, stage: "config" };
  }

  const { email, host, port, password } = configured.keys;
  let socket: ReturnType<typeof connect> | undefined;
  try {
    const secureTransport = port === 465 ? "on" : port === 587 ? "starttls" : "off";
    socket = connect({ hostname: host, port }, { secureTransport, allowHalfOpen: true });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    await expectCode(reader, writer, 220);
    await expectCode(reader, writer, 250, `EHLO gritroom.workers.dev`);

    if (secureTransport === "starttls") {
      await expectCode(reader, writer, 220, "STARTTLS");
      await writer.releaseLock();
      reader.releaseLock();
      await socket.startTls();
      const secureWriter = socket.writable.getWriter();
      const secureReader = socket.readable.getReader();
      await expectCode(secureReader, secureWriter, 250, `EHLO gritroom.workers.dev`);
      await expectCode(secureReader, secureWriter, 334, "AUTH LOGIN");
      await expectCode(secureReader, secureWriter, 334, toBase64(email));
      await expectCode(secureReader, secureWriter, 235, toBase64(password));
      await expectCode(secureReader, secureWriter, 221, "QUIT");
      await secureWriter.close().catch(() => undefined);
      secureReader.releaseLock();
    } else {
      await expectCode(reader, writer, 334, "AUTH LOGIN");
      await expectCode(reader, writer, 334, toBase64(email));
      await expectCode(reader, writer, 235, toBase64(password));
      await expectCode(reader, writer, 221, "QUIT");
      await writer.close().catch(() => undefined);
      reader.releaseLock();
    }

    await db
      .prepare(
        `INSERT INTO email_send_log (id, purpose, to_email, status, detail, created_at)
         VALUES (?, 'gmail-check', ?, 'accepted', 'auth-ok', ?)`,
      )
      .bind(createId("eml"), email, nowIso())
      .run();

    return { ok: true, messageId: "auth-ok" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Gmail connection check failed.";
    return {
      ok: false,
      reason,
      stage: /AUTH|235|534|535/i.test(reason) ? "auth" : "connect",
    };
  } finally {
    try {
      await socket?.close();
    } catch {
      // ignore
    }
  }
}
