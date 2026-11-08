import { getGmailSmtpKeys } from "@/lib/secrets";

export async function GET() {
  const gmail = getGmailSmtpKeys();
  return Response.json({
    app: "gritroom",
    gmailConfigured: gmail.ok,
  });
}
