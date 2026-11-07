import Link from "next/link";
import { EntryLayout } from "@/components/EntryLayout";

export default function Home() {
  return (
    <EntryLayout>
      <p className="eyebrow">Let’s get started</p>
      <h1 id="entry-heading">Step into GritRoom.</h1>
      <p className="lede">A quiet space to work on your next small win.</p>
      <div className="entry-actions">
        <Link className="button" href="/login?entry=learner">
          I’m learning <span aria-hidden="true">→</span>
        </Link>
        <Link className="button secondary" href="/login?entry=parent">
          Parent access <span aria-hidden="true">→</span>
        </Link>
      </div>
      <p className="entry-privacy">Your answers and working stay in your family’s private room.</p>
    </EntryLayout>
  );
}
