// The checker mark from the Indie Creations logo, redrawn as SVG so it stays
// crisp at any size and can inherit colour.
export function Mark({ size = 28, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <rect width="100" height="100" rx="9" fill="currentColor" />
      <rect x="50" y="12" width="38" height="38" rx="4" fill="var(--paper)" />
      <rect x="12" y="50" width="38" height="38" rx="4" fill="var(--paper)" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="logo">
      <Mark size={26} />
      <span className="logo-word">Indie Creations</span>
    </span>
  );
}
