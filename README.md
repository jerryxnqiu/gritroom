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
| Coaching reports and videos | Add a title, YouTube link and optional notes/file. Click **Ask Codex** to copy a task that points at the remote D1 row and R2 object; Codex reads them and writes findings back to D1. | Findings store English summary, optional Chinese parent reading, training directions and evidence limits in `material_analyses`, plus a summary in `learning_evidence`. Deleting the resource removes its analyses and those evidence copies. |
| Practice questions from other sources | Upload miscellaneous workbook/question pages as style exemplars (no per-file Ask Codex). | Used with coaching materials when you click **Ask Codex to generate practice bank**. |
| Generate practice bank | One archive-level Codex task lists all shelf materials + blueprints and asks Codex to insert new `practice_questions` versions in D1 (figures to R2 when needed). | Refreshes Starting-point check / Focused practice without rewriting old attempt snapshots. |
| Practice evidence | Learner room starts a resumable starting-point check (all active D1 bank items for the goal) or focused practice (5 items). Questions live in `practice_questions` (optional R2 `image_key` for figures). Each attempt snapshots prompt, options, correct answer, question id/version and image key in `practice_attempts`, plus a summary in `learning_evidence`. | Feeds summaries and later bank refreshes / generation. |
| Feedback and question preferences | Parents can save observations and preferences. Authors and family administrators can withdraw them. | Active feedback is also copied into `learning_evidence` for later generation context. |

### Model roles

| Role | Tool | Use |
| --- | --- | --- |
| Learner assistant | DeepSeek (`deepseek-api-key`) | In-practice chat for the child on a question; useful turns saved as evidence later. |
| Material / deep review | Codex (desktop chat) | Coaching reports, videos, study files and owner deeper reviews; findings written back into the shelf. |

### How to ask Codex

**Coaching report/video (optional deep read)**  
Click **Ask Codex** on that item → paste into a Codex chat in this repo → Codex writes `material_analyses` / `learning_evidence`.

**Refresh the practice bank from everything in the archive**  
1. Upload coaching reports under **02** and miscellaneous practice-question pages under **03**.  
2. Click **Ask Codex to generate practice bank** under **04**.  
3. Paste into a Codex chat in this `gritroom` repo (wrangler logged into the gritroom Cloudflare account).  
4. Codex reads blueprints + all listed D1/R2 materials and inserts new `practice_questions` versions (optional figures under `question-bank/...` in R2).  
5. Start a new learner practice session to use the refreshed bank.

Migration `0005_resource_shelf.sql` adds the private material index and feedback history. Migration `0006_learning_inputs.sql` adds analyses, learning evidence and practice attempt tables. Migration `0007_practice_questions.sql` adds the versioned D1 question bank (seeded from the original starter items) and attempt snapshot columns for question id/version and figure `image_key`. Attachments and future question figures are stored in R2. Maximum 8 MB per PDF, JPG, PNG or WebP attachment.

## Next milestones

1. Build the learner DeepSeek assistant chat on practice questions and save useful dialogue as evidence.
2. Refresh `practice_questions` in D1 (via Codex) from blueprints + material analyses; add figures to R2 when needed. Working-file uploads on attempts later.
3. Build the learning loop and timed papers from the D1 bank; owner deeper review snapshot flow; more subjects later.

## Production

The project is configured for Cloudflare. The existing `npm run deploy` command applies remote D1 migrations before deployment; do not use it for a local check. Verify the target D1 and R2 bindings, back up production data and review migrations separately before publishing. Keep `gmail-smtp-keys` (JSON text) and `deepseek-api-key` in Worker Secrets for the future learner assistant. Do not commit credentials or real learner data.
