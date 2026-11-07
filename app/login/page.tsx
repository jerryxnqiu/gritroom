import Link from "next/link";

import { SignInForm } from "@/components/SignInForm";

type SearchParams = Promise<{ entry?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const entry = params.entry === "learner" ? "learner" : "parent";

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Sign in</p>
        <h1 className="brand" style={{ fontSize: "clamp(2.2rem, 6vw, 3.4rem)" }}>
          {entry === "learner" ? "Learner entry" : "Parent entry"}
        </h1>
        <p className="lede">
          Email a one-time code to your own address. The role button chooses the entry screen; access still depends on
          family relationships.
        </p>
      </section>

      <div className="tabs">
        <Link className={`tab ${entry === "learner" ? "active" : ""}`} href="/login?entry=learner">
          Learner
        </Link>
        <Link className={`tab ${entry === "parent" ? "active" : ""}`} href="/login?entry=parent">
          Parent
        </Link>
      </div>

      <section className="card" style={{ maxWidth: 480 }}>
        <SignInForm entry={entry} />
      </section>
    </main>
  );
}
