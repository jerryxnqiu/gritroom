import type { ReactNode } from "react";
import { Brand, GrowthArtwork } from "./Brand";

export function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <main className="entry-layout">
      <section className="entry-art" aria-label="Welcome to GritRoom">
        <Brand light />
        <div className="entry-promise">
          <p className="eyebrow">Welcome to your practice room</p>
          <p className="display-title">Good thinking takes <em>practice.</em></p>
          <p className="entry-support">One question. One clearer idea.<br />A little better, every day.</p>
        </div>
        <div className="entry-art-footer">
          <GrowthArtwork className="entry-illustration" />
          <p className="eyebrow">Thinking skills · Selective preparation</p>
        </div>
      </section>
      <section className="entry-content" aria-labelledby="entry-heading">
        <div className="entry-inner">{children}</div>
      </section>
    </main>
  );
}
