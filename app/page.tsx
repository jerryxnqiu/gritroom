import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Family learning space</p>
        <h1 className="brand">GritRoom</h1>
        <p className="lede">
          Observe learning evidence, explain what is hard, and keep the next practice ready. Built first for Thinking
          Skills on iPad, with Selective and OC goals.
        </p>
      </section>

      <section className="grid-two">
        <article className="card">
          <h2>I’m practising</h2>
          <p>Continue a set, start a check, or open the next lesson when it is ready.</p>
          <Link className="secondary" href="/login?entry=learner" style={{ display: "inline-block" }}>
            Enter as learner
          </Link>
        </article>
        <article className="card">
          <h2>I’m a parent</h2>
          <p>Manage family access, save observations, add resources, and review progress.</p>
          <Link className="secondary" href="/login?entry=parent" style={{ display: "inline-block" }}>
            Enter as parent
          </Link>
        </article>
      </section>
    </main>
  );
}
