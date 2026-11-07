import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link className={`wordmark${light ? " wordmark-light" : ""}`} href="/" aria-label="GritRoom home">
      <span className="brand-mark" aria-hidden="true">g<span>.</span></span>
      <span><strong>GritRoom</strong><small>A little better, every day</small></span>
    </Link>
  );
}

export function GrowthArtwork({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 350 260" fill="none" aria-hidden="true" focusable="false">
      <circle cx="203" cy="130" r="124" stroke="#cde0ae" strokeOpacity=".10" />
      <circle cx="203" cy="130" r="100" stroke="#cde0ae" strokeOpacity=".08" />
      <path d="M117 63v30m-15-15h30m-25.6-10.6 21.2 21.2m0-21.2-21.2 21.2" stroke="#d2e5b4" strokeWidth="2" strokeLinecap="round" />
      <circle cx="274" cy="55" r="38" fill="#dfad75" />
      <circle cx="263" cy="44" r="26" fill="#f2cf9a" fillOpacity=".28" />
      <path d="m39 202 79-13v50l-79 15z" fill="#46674d" />
      <path d="M28 196a8 8 0 0 1 6-8l69-12a6 6 0 0 1 7 6v51l-82 16z" fill="#72916a" />
      <path d="m127 165 83-13v84l-83 17z" fill="#5c7c5a" />
      <path d="M116 158a8 8 0 0 1 6-8l74-13a6 6 0 0 1 7 6v86l-87 18z" fill="#9db98a" />
      <path d="m221 121 86-13v124l-86 19z" fill="#90ad7d" />
      <path d="M210 116a8 8 0 0 1 6-8l77-13a6 6 0 0 1 7 6v124l-90 21z" fill="#cbdcae" />
    </svg>
  );
}
