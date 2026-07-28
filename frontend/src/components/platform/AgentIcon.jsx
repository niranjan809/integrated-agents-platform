import { SparkleSearchIcon } from '../../gtm/components/icons';

// Renders an agent/section icon. Most agents use a glyph/emoji string straight from
// the registry (e.g. ◎ ◇ △ 𝕏). GTM Intelligence is special-cased to the
// SparkleSearchIcon SVG so it reads consistently on every surface (section pages,
// admin panel, in-app header) — EXCEPT the landing page, which intentionally shows
// the raw 🔍 emoji and so renders the string directly without this component.
// The SVG is monochrome (currentColor) and sized to 1em, so it inherits the
// container's color and font-size exactly like the glyph it replaces.
export default function AgentIcon({ id, icon, className = 'agent-svg-icon' }) {
  if (id === 'gtm') return <SparkleSearchIcon className={className} />;
  return <>{icon}</>;
}
