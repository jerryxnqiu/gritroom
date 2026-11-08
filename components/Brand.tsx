import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link className={`wordmark${light ? " wordmark-light" : ""}`} href="/" aria-label="GritRoom home">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-letter">g</span>
        <span className="brand-dot">.</span>
      </span>
      <span><strong>GritRoom</strong><small>A little better, every day</small></span>
    </Link>
  );
}

export function GrowthArtwork({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 360 250" fill="none" aria-hidden="true" focusable="false">
      <path d="M92 58v28M78 72h28M82 62l20 20m0-20-20 20" stroke="#d2e5b4" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="286" cy="52" r="40" fill="#dfad75" />
      <circle cx="274" cy="40" r="27" fill="#f2cf9a" fillOpacity=".32" />
      <path d="m36 198 78-12v46l-78 14z" fill="#46674d" />
      <path d="M26 192a7 7 0 0 1 5.5-7l68-11a6 6 0 0 1 6.8 5.8v47.5l-80.3 15.2z" fill="#72916a" />
      <path d="m126 162 82-12v78l-82 16z" fill="#5c7c5a" />
      <path d="M116 156a7 7 0 0 1 5.5-7l73-12a6 6 0 0 1 6.8 5.8v80.5l-85.3 17.2z" fill="#9db98a" />
      <path d="m220 118 84-12v114l-84 18z" fill="#90ad7d" />
      <path d="M210 113a7 7 0 0 1 5.5-7l75-12a6 6 0 0 1 6.8 5.8v116.5l-87.3 18.7z" fill="#cbdcae" />
    </svg>
  );
}
