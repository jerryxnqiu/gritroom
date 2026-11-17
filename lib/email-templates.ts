/** Plain + HTML bodies for outbound mail. Keep HTML table-based for email clients. */

export function signInCodeEmail(input: { code: string; minutes: number }) {
  const { code, minutes } = input;
  const text = [
    "Your GritRoom sign-in code",
    "",
    code,
    "",
    `This code expires in ${minutes} minutes.`,
    "If you did not request this code, you can ignore this email.",
    "",
    "— GritRoom",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your GritRoom sign-in code</title>
</head>
<body style="margin:0;padding:0;background:#eef3e8;color:#263b34;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3e8;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#ffffff;border:1px solid #d5e0cc;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px 8px;background:#f7faf3;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6a8a57;">GritRoom</p>
              <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15;letter-spacing:-0.03em;color:#174c3c;font-weight:600;">Your sign-in code</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#263b34;">
              Enter this code to open your room. It expires in <strong>${minutes} minutes</strong>.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 28px 10px;">
              <div style="display:inline-block;padding:16px 28px;border-radius:14px;background:#eaf0e2;border:1px solid #c5d6b8;">
                <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:.28em;color:#174c3c;">${code}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:#5b6f66;">
              If you did not request this code, you can ignore this email. Your password is never needed.
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#7a8c82;">
          Small steps. Strong thinking.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}
