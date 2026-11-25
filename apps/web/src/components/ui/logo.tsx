/** Placeholder identity: two overlapping squares (an eight-point star) plus a wordmark. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="1" stroke="#0b6e69" strokeWidth="2" />
      <rect
        x="4.5"
        y="4.5"
        width="15"
        height="15"
        rx="1"
        stroke="#0b6e69"
        strokeWidth="2"
        transform="rotate(45 12 12)"
      />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`}
    >
      <LogoMark />
      <span className="text-[18px]">Shifo</span>
    </span>
  );
}
