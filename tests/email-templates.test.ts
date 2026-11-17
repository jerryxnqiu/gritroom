import assert from "node:assert/strict";
import { test } from "node:test";

import { signInCodeEmail } from "../lib/email-templates.ts";

test("sign-in code email includes the code in text and html", () => {
  const mail = signInCodeEmail({ code: "482917", minutes: 10 });
  assert.match(mail.text, /482917/);
  assert.match(mail.text, /10 minutes/);
  assert.match(mail.html, /482917/);
  assert.match(mail.html, /GritRoom/);
  assert.match(mail.html, /expires in <strong>10 minutes<\/strong>/);
});
