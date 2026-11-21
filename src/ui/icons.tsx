import type { SVGAttributes } from 'preact';

interface IconProps {
  size?: number;
}

function base(size = 18): SVGAttributes<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

export function IconLine({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 19L19 5" />
    </svg>
  );
}

export function IconCircle({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function IconMenu({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconMore({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClose({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconExpand({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function IconCalculator({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </svg>
  );
}

export function IconMap({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="5" cy="6" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7.1 6h9.8M6.2 8l4.6 8M17.8 8l-4.6 8" />
    </svg>
  );
}

export function IconSun({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  );
}

export function IconMoon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function IconCopy({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
  );
}

export function IconCheck({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function IconStar({ size }: IconProps) {
  return (
    <svg {...base(size)} fill="currentColor" stroke="none">
      <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" />
    </svg>
  );
}

export function IconTrash({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconEdit({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20h4l10-10-4-4L4 16v4zM13.5 6.5l4 4" />
    </svg>
  );
}

export function IconSearch({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function IconFirst({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M18 6l-6 6 6 6M7 5v14" />
    </svg>
  );
}

export function IconPrev({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconNext({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconLast({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l6 6-6 6M17 5v14" />
    </svg>
  );
}

export function IconInfo({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </svg>
  );
}

export function IconSpark({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}

export function IconPlus({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconUndo({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h9a6 6 0 0 1 0 12h-1" />
    </svg>
  );
}

export function IconRedo({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12h-9a6 6 0 0 0 0 12h1" />
    </svg>
  );
}

export function IconFit({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconZoomIn({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8M11 8v6M8 11h6" />
    </svg>
  );
}

export function IconZoomOut({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8M8 11h6" />
    </svg>
  );
}

export function IconEye({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7M6.3 7.9A17 17 0 0 0 2.5 12S6 18 12 18c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function IconLock({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconUnlock({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 7.5-2" />
    </svg>
  );
}

export function IconCursor({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 3l6.5 17 2.3-6.7 6.7-2.3z" />
    </svg>
  );
}

export function IconLink({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M10 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.3 6" />
      <path d="M14 11a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7L12.7 18" />
    </svg>
  );
}

export function IconSquare({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}

export function IconText({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 5h14M12 5v14M9 19h6" />
    </svg>
  );
}

export function IconArrow({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 19L19 5M19 5h-8M19 5v8" />
    </svg>
  );
}

export function IconLayers({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

export function IconLayout({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="8" y="3" width="8" height="5" rx="1.2" />
      <rect x="3" y="11" width="7" height="5" rx="1.2" />
      <rect x="14" y="11" width="7" height="5" rx="1.2" />
      <path d="M12 8v3M6.5 11V9h11v2" />
    </svg>
  );
}

export function IconNote({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 3h9l5 5v13H5z" />
      <path d="M14 3v5h5M8 12h8M8 16h5" />
    </svg>
  );
}

export function IconDownload({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
