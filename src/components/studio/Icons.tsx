import type { SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "camera"
  | "check"
  | "close"
  | "download"
  | "expand"
  | "mic"
  | "pause"
  | "play"
  | "screen"
  | "sliders"
  | "stop"
  | "upload";

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 20, ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "play") {
    return (
      <svg {...common} {...props}>
        <path d="M8 5.6 18.5 12 8 18.4V5.6Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "pause") {
    return (
      <svg {...common} {...props}>
        <path d="M8 5.5v13M16 5.5v13" strokeWidth="2.4" />
      </svg>
    );
  }
  if (name === "stop") {
    return (
      <svg {...common} {...props}>
        <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "upload") {
    return (
      <svg {...common} {...props}>
        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
        <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
      </svg>
    );
  }
  if (name === "screen") {
    return (
      <svg {...common} {...props}>
        <rect x="3" y="4.5" width="18" height="12" rx="2" />
        <path d="M8.5 20h7M12 16.5V20" />
        <path d="M7 11.2c1.2-1.6 2.85-2.4 5-2.4s3.8.8 5 2.4" />
      </svg>
    );
  }
  if (name === "mic") {
    return (
      <svg {...common} {...props}>
        <rect x="8.5" y="3" width="7" height="12" rx="3.5" />
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
      </svg>
    );
  }
  if (name === "download") {
    return (
      <svg {...common} {...props}>
        <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19.5h14" />
      </svg>
    );
  }
  if (name === "camera") {
    return (
      <svg {...common} {...props}>
        <path d="M4 8.5h3l1.3-2h7.4l1.3 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
        <circle cx="12" cy="13.5" r="3.5" />
      </svg>
    );
  }
  if (name === "expand") {
    return (
      <svg {...common} {...props}>
        <path d="M8.5 4H4v4.5M15.5 4H20v4.5M8.5 20H4v-4.5M15.5 20H20v-4.5" />
      </svg>
    );
  }
  if (name === "sliders") {
    return (
      <svg {...common} {...props}>
        <path d="M4 7h6M14 7h6M4 17h10M18 17h2" />
        <circle cx="12" cy="7" r="2" />
        <circle cx="16" cy="17" r="2" />
      </svg>
    );
  }
  if (name === "arrow-left") {
    return (
      <svg {...common} {...props}>
        <path d="M19 12H5m0 0 5-5m-5 5 5 5" />
      </svg>
    );
  }
  if (name === "close") {
    return (
      <svg {...common} {...props}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common} {...props}>
        <path d="m5 12 4.2 4.2L19 6.5" />
      </svg>
    );
  }
  return null;
}

export function SignalMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="16.5" stroke="currentColor" strokeWidth="1" opacity="0.32" />
      <path d="M4 20h7l2.6-8 5.2 17L24 8l3.7 12H36" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="20" cy="20" r="3.2" fill="currentColor" />
    </svg>
  );
}
