/** The broadcast icon in its parts, from the middle out */
const PARTS = [
  // The dot
  ["M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"],
  // The inner arcs
  [
    "M5.172 5.172a4 4 0 0 0 0 5.656.5.5 0 1 1-.708.708 5 5 0 0 1 0-7.072.5.5 0 0 1 .708.708z",
    "M10.828 4.464a.5.5 0 0 1 .708 0 5 5 0 0 1 0 7.072.5.5 0 1 1-.708-.708 4 4 0 0 0 0-5.656.5.5 0 0 1 0-.708z",
  ],
  // The outer arcs
  [
    "M3.05 3.05a7 7 0 0 0 0 9.9.5.5 0 0 1-.707.707 8 8 0 0 1 0-11.314.5.5 0 0 1 .707.707z",
    "M12.95 2.344a.5.5 0 0 1 .707 0 8 8 0 0 1 0 11.313.5.5 0 0 1-.707-.707 7 7 0 0 0 0-9.9.5.5 0 0 1 0-.707z",
  ],
];

/** Seconds between the parts lighting up */
const STEP = 0.25;

/**
 * The sync icon. While syncing it dims, and light runs through it from the
 * middle out until the sync is done.
 */
export const SyncSignal = ({ syncing }: { syncing: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={16}
    height={16}
    viewBox="0 0 16 16"
    fill="currentColor"
    className={syncing ? "text-lavender-grey" : ""}
  >
    {PARTS.map((paths, i) => (
      <g
        key={i}
        className={syncing ? "animate-signal" : ""}
        style={syncing ? { animationDelay: `${i * STEP}s` } : undefined}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    ))}
  </svg>
);
