import Link from "next/link";
import { EntryLayout } from "@/components/EntryLayout";
import { SignInForm } from "@/components/SignInForm";

type SearchParams = Promise<{ entry?: string }>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { entry: requestedEntry } = await searchParams;
  const entry = requestedEntry === "parent" ? "parent" : "learner";

  return (
    <EntryLayout>
      <p className="eyebrow">Welcome back</p>
      <h1 id="entry-heading">Step into GritRoom.</h1>
      <p className="lede">A quiet space to work on your next small win.</p>
      <nav className="entry-tabs" aria-label="Sign-in options">
        <Link href="/?entry=learner" aria-current={entry === "learner" ? "page" : undefined}>I’m learning</Link>
        <Link href="/?entry=parent" aria-current={entry === "parent" ? "page" : undefined}>Parent access</Link>
      </nav>
      <p className="entry-method">Email code</p>
      <SignInForm key={entry} entry={entry} />
      <details className="entry-help">
        <summary>How do I sign in?</summary>
        <p>Enter your own email address. We’ll send a six-digit code to that inbox. Your email password is never needed.</p>
        <p>{entry === "learner" ? "You can only open a learner profile connected to your verified email." : "After verifying your email, you can open a family room you’re authorised to manage or set up your own."}</p>
      </details>
      <p className="entry-privacy">Your answers and working stay in your family’s private room.</p>
    </EntryLayout>
  );
}
