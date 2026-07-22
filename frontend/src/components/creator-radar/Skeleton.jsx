// Simple loading-skeleton block. Pulses via Tailwind's animate-pulse. Callers compose
// these into row/card shapes (see Accounts table + Overview cards).
export function Skeleton({ width = "100%", height = "0.9rem", className = "", rounded = "rounded" }) {
  return (
    <span
      className={`inline-block animate-pulse bg-gray-200 ${rounded} ${className}`}
      style={{ width, height }}
    />
  );
}

export default Skeleton;
