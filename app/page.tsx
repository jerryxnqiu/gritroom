import Link from "next/link";
import { EntryLayout } from "@/components/EntryLayout";
import { SignInForm } from "@/components/SignInForm";

type SearchParams = Promise<{ entry?: string }>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { entry: requestedEntry } = await searchParams;
  const entry = requestedEntry === "parent" ? "parent" : "learner";

  return (
    <EntryLayout>
      <p className="eyebrow">Let’s get started</p>
      <h1 id="entry-heading">Step into GritRoom.</h1>
      <p className="lede">A quiet space to work on your next small win.</p>
      <nav className="entry-tabs" aria-label="Sign-in options">
        <Link href="/?entry=learner" aria-current={entry === "learner" ? "page" : undefined}>I’m learning</Link>
        <Link href="/?entry=parent" aria-current={entry === "parent" ? "page" : undefined}>Parent access</Link>
      </nav>
      <div className="entry-methods" role="tablist" aria-label="Sign-in method">
        <span className="entry-method is-muted" aria-disabled="true">Access code</span>
        <span className="entry-method" role="tab" aria-selected="true">Email code</span>
      </div>
      <SignInForm key={entry} entry={entry} />
      <p className="entry-hint">
        {entry === "learner"
          ? "For learner access, use the learner email your parent set up, or the parent email if no learner email is set."
          : "Use the parent email for this family room. We’ll send a six-digit code — your email password is never needed."}
      </p>
      <details className="entry-help">
        <summary>How do I get an access code?</summary>
        <p>Access codes are created by a parent in the family room. Until then, sign in with an approved family email and the code we send to that inbox.</p>
      </details>
      <p className="entry-privacy">Your answers and working stay in your family’s private room.</p>
    </EntryLayout>
  );
}
