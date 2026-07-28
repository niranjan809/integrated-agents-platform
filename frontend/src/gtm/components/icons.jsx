// Small inline-SVG icon set (no icon library dependency) shared by the GTM
// section header/nav, the Dashboard stat cards/tabs, and the platform's AgentIcon.

function base(paths, className) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

export function SearchIcon({ className }) {
  return base('<path d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />', className);
}

export function SparkleSearchIcon({ className }) {
  return base(
    '<path d="M11 19a8 8 0 100-16 8 8 0 000 16z" /><path d="M21 21l-4.35-4.35" /><path d="M11 8v2M11 14v2M8 11h2M14 11h2" stroke-width="1.4" />',
    className
  );
}

export function DashboardIcon({ className }) {
  return base(
    '<rect x="3.75" y="3.75" width="7" height="7" rx="1.5" /><rect x="13.25" y="3.75" width="7" height="7" rx="1.5" /><rect x="3.75" y="13.25" width="7" height="7" rx="1.5" /><rect x="13.25" y="13.25" width="7" height="7" rx="1.5" />',
    className
  );
}

export function BuildingIcon({ className }) {
  return base(
    '<path d="M5 21V7l7-4 7 4v14" /><path d="M3 21h18" /><path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 21v-4h6v4" />',
    className
  );
}

export function PipelineIcon({ className }) {
  return base(
    '<path d="M3.75 5.25h16.5" /><path d="M10.5 12.75V19l3-1.5v-4.75" /><path d="M3.75 5.25L10.5 12.75M20.25 5.25L13.5 12.75" />',
    className
  );
}

export function DocumentIcon({ className }) {
  return base(
    '<path d="M7 3.75h7l4 4V19.5a1 1 0 01-1 1H7a1 1 0 01-1-1V4.75a1 1 0 011-1z" /><path d="M14 3.75V8h4.25" /><path d="M9 13h6M9 16.5h6" />',
    className
  );
}

export function TargetIcon({ className }) {
  return base(
    '<circle cx="12" cy="12" r="8.25" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.75" fill="currentColor" />',
    className
  );
}

// Monochrome (currentColor) scope icons — the emoji versions (🌐/🗺️) they
// replace are pre-colored glyphs that ignore the surrounding text color, so
// the icon never actually matched the badge's green/blue text.
export function GlobeIcon({ className }) {
  return base(
    '<circle cx="12" cy="12" r="8.25" /><path d="M3.75 12h16.5" /><path d="M12 3.75c2.25 2.1 3.5 5.1 3.5 8.25s-1.25 6.15-3.5 8.25c-2.25-2.1-3.5-5.1-3.5-8.25s1.25-6.15 3.5-8.25z" />',
    className
  );
}

export function MapPinIcon({ className }) {
  return base(
    '<path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 005.5 10c0 5.4 6.5 11 6.5 11z" /><circle cx="12" cy="10" r="2.25" />',
    className
  );
}

export function CompareIcon({ className }) {
  return base('<circle cx="9" cy="12" r="6.25" /><circle cx="15" cy="12" r="6.25" />', className);
}
