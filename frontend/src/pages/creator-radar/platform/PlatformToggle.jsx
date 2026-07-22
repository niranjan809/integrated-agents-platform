import { usePlatform } from "./PlatformContext";

// Two pill buttons between the title and the tabs. Selected = solid navy (slate-900) +
// white text; unselected = transparent + gray-500 text + gray-300 border. ~4px gap.
const OPTIONS = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
];

export default function PlatformToggle() {
  const { platform, setPlatform } = usePlatform();
  return (
    <div className="u-flex u-gap-1">
      {OPTIONS.map(([value, label]) => {
        const active = platform === value;
        return (
          <button
            key={value}
            onClick={() => setPlatform(value)}
            aria-pressed={active}
            className={`u-rounded-full u-px-3 u-py-1 u-text-sm u-outline-none u-transition-colors u-focus-visible-outline u-focus-visible-outline-2 u-focus-visible-outline-offset-2 u-focus-visible-outline-slate-500 ${
              active
                ? "u-bg-slate-900"
                : "u-border u-border-gray-300 u-text-gray-500 u-hover-text-gray-700"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
