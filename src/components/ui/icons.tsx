import type { SVGProps } from "react";

/**
 * The drawn icon set.
 *
 * One family, one geometry: a 24×24 viewbox, 1.5px stroke in `currentColor`,
 * round caps and joins, rendered at 16px unless a caller asks otherwise.
 * DESIGN.md forbids Unicode glyphs and emoji standing in for icons, so every
 * mark in the interface comes from here.
 *
 * Icons are decorative by default (`aria-hidden`); pass a `title` only when the
 * icon is the sole content of a control, and prefer an `aria-label` on the
 * control itself.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
};

function Icon({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* --- navigation ----------------------------------------------------------- */

export const IconOverview = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z" />
  </Icon>
);

export const IconForm = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h12v18H6z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Icon>
);

export const IconArchive = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16v13H4z" />
    <path d="M3 4h18v3H3zM10 11h4" />
  </Icon>
);

export const IconHistory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v4h4M12 7.5V12l3 2" />
  </Icon>
);

export const IconInbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.5 4h13l2.5 9v7H3v-7z" />
  </Icon>
);

export const IconPublish = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h16v12H8l-4 4z" />
    <path d="M9 10h6" />
  </Icon>
);

export const IconRoster = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M17 8.5h5M17 12h5M17 15.5h3" />
  </Icon>
);

export const IconImport = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15V3" />
    <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
    <path d="M4 15v5h16v-5" />
  </Icon>
);

export const IconMatrix = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4h18v16H3z" />
    <path d="M3 9h18M3 14.5h18M9 4v16" />
  </Icon>
);

export const IconBacklog = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Icon>
);

export const IconSetup = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4v16M6 8.5h6M18 4v16M18 15.5h-6" />
    <path d="M12 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 13.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
  </Icon>
);

export const IconAudit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
    <path d="M12 7v5l3.5 2" />
  </Icon>
);

export const IconCourse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4.5h6.5A2.5 2.5 0 0 1 13 7v13a2 2 0 0 0-2-2H4z" />
    <path d="M20 4.5h-6.5A2.5 2.5 0 0 0 11 7" />
    <path d="M20 4.5V18h-7" />
  </Icon>
);

export const IconWeek = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5h16V20H4z" />
    <path d="M4 10h16M8.5 3v5M15.5 3v5" />
  </Icon>
);

export const IconAdmin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 4 6.2v5.4c0 4.4 3.2 8.1 8 9.4 4.8-1.3 8-5 8-9.4V6.2z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

/* --- actions and affordances ---------------------------------------------- */

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4" />
  </Icon>
);

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6h17l-6.5 7.5V20l-4-2v-4.5z" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
);

export const IconBack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const IconForward = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4 2.5 20.5h19z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </Icon>
);

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </Icon>
);

export const IconError = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Icon>
);

/** A private reply travels back to one student. */
export const IconPrivate = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5 3 11l6 6" />
    <path d="M3 11h11a6 6 0 0 1 6 6v2" />
  </Icon>
);

/** A public answer goes out to the whole section. */
export const IconPublic = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l6 6-6 6" />
    <path d="M21 11H10a6 6 0 0 0-6 6v2" />
  </Icon>
);

export const IconNote = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3h14v18H5z" />
    <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 16v5h16v-5" />
  </Icon>
);

/* --- stamp marks ----------------------------------------------------------
   Solid shapes, not strokes: they read at 8px and they survive grayscale, so
   status never depends on tone alone. */

export function StampMark({
  shape,
  size = 8,
}: {
  shape: "square" | "triangle" | "diamond" | "hollow";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 10 10",
    "aria-hidden": true as const,
    focusable: "false" as const,
    className: "stamp__mark",
  };
  switch (shape) {
    case "square":
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="9" height="9" fill="currentColor" />
        </svg>
      );
    case "triangle":
      return (
        <svg {...common}>
          <path d="M5 0.5 9.7 9.5H0.3z" fill="currentColor" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <path d="M5 0.2 9.8 5 5 9.8 0.2 5z" fill="currentColor" />
        </svg>
      );
    case "hollow":
      return (
        <svg {...common}>
          <rect
            x="1"
            y="1"
            width="8"
            height="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
  }
}

/** Category marks: a distinct silhouette per category, never a colour. */
export function CategoryMark({
  shape,
  size = 8,
}: {
  shape: "square" | "triangle" | "circle";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 10 10",
    "aria-hidden": true as const,
    focusable: "false" as const,
    className: "category__mark",
  };
  if (shape === "circle") {
    return (
      <svg {...common}>
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "triangle") {
    return (
      <svg {...common}>
        <path d="M5 0.8 9.4 9.2H0.6z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="0.8" y="0.8" width="8.4" height="8.4" fill="currentColor" />
    </svg>
  );
}
