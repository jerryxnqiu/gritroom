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

## Next milestones

1. Original Thinking Skills questions, diagnostic practice, resumable sessions and deterministic feedback.
2. Timed papers, private working uploads, Resource shelf and progress.
3. Evidence-based next steps, tutoring, parent feedback and the owner's deeper review.
4. Optional device codes, more question visuals and subjects.

## Production

The project is configured for Cloudflare. The existing `npm run deploy` command applies remote D1 migrations before deployment; do not use it for a local check. Verify the target D1 and R2 bindings, back up production data and review migrations separately before publishing. Keep `gmail-smtp-keys` (JSON text) and `deepseek-api-key` in Worker Secrets. Do not commit credentials or real learner data.
