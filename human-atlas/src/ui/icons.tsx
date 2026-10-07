import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </Icon>
);
export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);
export const IconMinus = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 8h9" />
  </Icon>
);
export const IconOrbit = (p: P) => (
  <Icon {...p}>
    <ellipse cx="8" cy="8" rx="6" ry="2.6" />
    <path d="M8 2v12" opacity=".55" />
    <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
);
export const IconPan = (p: P) => (
  <Icon {...p}>
    <path d="M8 1.8v12.4M1.8 8h12.4M8 1.8 6.3 3.5M8 1.8l1.7 1.7M8 14.2l-1.7-1.7M8 14.2l1.7-1.7M1.8 8l1.7-1.7M1.8 8l1.7 1.7M14.2 8l-1.7-1.7M14.2 8l-1.7 1.7" />
  </Icon>
);
export const IconReset = (p: P) => (
  <Icon {...p}>
    <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" />
    <path d="M2.6 2.4v2.9h2.9" />
  </Icon>
);
export const IconExpand = (p: P) => (
  <Icon {...p}>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Icon>
);
export const IconCollapse = (p: P) => (
  <Icon {...p}>
    <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />
  </Icon>
);
export const IconExplode = (p: P) => (
  <Icon {...p}>
    <rect x="6" y="6" width="4" height="4" rx=".8" />
    <rect x="1.8" y="1.8" width="3" height="3" rx=".7" />
    <rect x="11.2" y="1.8" width="3" height="3" rx=".7" />
    <rect x="1.8" y="11.2" width="3" height="3" rx=".7" />
    <rect x="11.2" y="11.2" width="3" height="3" rx=".7" />
  </Icon>
);
export const IconIsolate = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.4" />
    <circle cx="8" cy="8" r="5.8" strokeDasharray="1.6 2" />
  </Icon>
);
export const IconChevron = (p: P) => (
  <Icon {...p}>
    <path d="m4.5 6.2 3.5 3.5 3.5-3.5" />
  </Icon>
);
export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);
export const IconLayers = (p: P) => (
  <Icon {...p}>
    <path d="M8 2.2 14 5.4 8 8.6 2 5.4z" />
    <path d="m2 8.2 6 3.2 6-3.2" />
    <path d="m2 10.8 6 3.2 6-3.2" opacity=".6" />
  </Icon>
);
export const IconFront = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="4" r="1.7" />
    <path d="M8 6.4v4.4M5 8h6M8 10.8 6.2 14M8 10.8 9.8 14" />
  </Icon>
);
