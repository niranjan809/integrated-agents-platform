// Simple loading-skeleton block. Pulses via Tailwind's animate-pulse. Callers compose
// these into row/card shapes (see Accounts table + Overview cards).
export function Skeleton({ width = "100%", height = "0.9rem", className = "", rounded = "u-rounded" }) {
  return (
    <span
      className={`u-inline-block u-animate-pulse u-bg-gray-200 ${rounded} ${className}`}
      style={{ width, height }}
    />
  );
}

export default Skeleton;
