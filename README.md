# GritRoom

An iPad-first family learning app for Selective and OC preparation. The frontend follows the Next.js App Router conventions with TypeScript and React, using Vinext to build the existing Cloudflare Worker.

## Local development

Use Node 22.18 or newer and npm.

```sh
npm ci
npm run db:migrate:local
npm run dev
npm run check
```

`app/` contains pages and route handlers, `components/` contains reusable UI, and `lib/` holds server data access, authentication and mail. Browser interactivity is isolated in client components. D1 and R2 bindings remain in `cloudflare.config.ts`.

The local migration command writes to the same `.cloudflare/state` directory as the Vinext dev Worker. Use disposable local data when exercising authentication. A real login-code request sends email only when SMTP is configured. Login codes are never returned by the HTTP API. Use a separate local fixture to test verification without sending real mail.

## Phase 1: identity and the room experience

- The welcome and email sign-in pages share the original green, cream and ascending-steps design. Email entry and six-digit verification work with keyboard submission.
- Parent room lets a verified parent create a family, add children, choose Selective or OC, switch the selected child and edit authorised profiles. A guardian can only see explicitly granted profiles.
- Pending learner invitations do not grant access. Each session resolves its current relationship, so stale session IDs do not grant access after a relationship is revoked. The learner room opens a profile only when it has a verified accepted link.
- Shared Gmail checks and test sends are installation-owner operations. A Cloudflare operator sets the `settings` row `installation_owner_user_id` to a JSON string containing the verified owner's internal user ID. Family creation never sets this value. Until configured the tools are hidden and their endpoints deny access.
- Phase 1 uses the existing schema. It does not migrate or import older production data.

## Phase 2: verified family invitations

- In **Family access → Link your child’s email**, the family administrator sends a seven-day invitation for the selected child. The child uses their own email to request a sign-in code, reviews the sender and family, then accepts. The email contains a sign-in link, not an access credential.
- **Invite another parent or guardian** grants access to the selected child only. Guardians cannot manage invitations. Removing a grant takes effect on the next request, including for an already signed-in guardian.
- Accepting atomically writes the invitation status and relationship. A verified account and child profile can each have only one learner link. Neither a pending invitation nor typing an email can claim existing progress.
- Mail failures leave no redeemable invitation. Cancel, expiry, decline and removal are separate actions. No access is granted by the login role tab.
- Apply migration `0003_family_invitations.sql` before running this version. It preserves valid accepted links from phase 1. If legacy links conflict, the migration fails rather than choosing a different owner. It does not import the earlier Worker’s data.

## Resource shelf

Open **Parent room → Resource shelf** for a child. The archive defaults to their current exam goal. Switch between **Selective** and **OC** to browse or add resources for either goal without changing the child's profile. Each child's archive is private to the parents or guardians authorised for that profile.

| Input | Current behaviour | Use in later practice |
| --- | --- | --- |
| Official exam information | Reviewed NSW format, worked examples and versioned authoring blueprints from migration `0004`. | Determines exam coverage, reasoning structure and how to verify an original answer. |
| Coaching reports and videos | Add a title, YouTube link and optional notes/file. Click **Analyse resource**. YouTube captions are fetched automatically and sent to DeepSeek. | Successful analyses store English findings, optional Chinese parent reading, training directions and evidence limits in `material_analyses`, and copy a durable summary into `learning_evidence`. |
| Extra study materials | Add a titled workbook page, image, PDF, link or notes, then analyse when notes describe the content. | Same analysis path as coaching materials. PDF page-image analysis is next; text notes are required for analysis today. |
| Practice evidence | Schema ready in `practice_sessions` / `practice_attempts`. Learner UI comes next. | Will store answer, correctness, time, confidence, draft notes and working files per question for summaries and generation. |
| Feedback and question preferences | Parents can save observations and preferences. Authors and family administrators can withdraw them. | Active feedback is also copied into `learning_evidence` for later generation context. |

Migration `0005_resource_shelf.sql` adds the private material index and feedback history. Migration `0006_learning_inputs.sql` adds analyses, learning evidence and practice attempt tables. Attachments are stored in R2 and downloaded through a parent-only route that checks current access to the child. Maximum 8 MB per PDF, JPG, PNG or WebP attachment.

## Next milestones

1. Build the checked original question bank and resumable diagnostic. Save and display the learner's question-by-question evidence, including private working uploads.
2. Build the learning loop. Use the current child's goal and latest evidence to choose a reviewed blueprint, use relevant material findings and active preferences to shape new questions, and independently verify the answer and distractors. Store blueprint versions and evidence references. Rebuild future recommendations when evidence changes and retain the question version in an existing attempt.
3. Add timed papers, contextual tutoring and an owner-only deeper review that uses a frozen evidence snapshot. Save review findings as additional evidence.
4. Add more question visuals and subjects.

## Production

The project is configured for Cloudflare. The existing `npm run deploy` command applies remote D1 migrations before deployment; do not use it for a local check. Verify the target D1 and R2 bindings, back up production data and review migrations separately before publishing. Keep `gmail-smtp-keys` (JSON text) and `deepseek-api-key` in Worker Secrets. DeepSeek calls use `https://api.deepseek.com` with model `deepseek-flash` by default (`deepseek-v4-pro` available for heavier work). Do not commit credentials or real learner data.
