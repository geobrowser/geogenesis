/** Mic/camera glyphs — geo's icon set has no AV icons, so these are inline. */

export function MicIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M12 7a4 4 0 0 1-8 0" />
      <path d="M8 11v3" />
      {muted && <path d="M2 2l12 12" stroke="currentColor" />}
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="6.25" />
      <ellipse cx="8" cy="8" rx="2.75" ry="6.25" />
      <path d="M2 6.25h12M2 9.75h12" strokeLinecap="round" />
    </svg>
  );
}

export function VideoIcon({ off = false }: { off?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
      <path d="M10.5 7l4-2.5v7L10.5 9" />
      {off && <path d="M2 2l12 12" stroke="currentColor" />}
    </svg>
  );
}
