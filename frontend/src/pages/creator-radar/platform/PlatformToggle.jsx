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
    <div className="flex gap-1">
      {OPTIONS.map(([value, label]) => {
        const active = platform === value;
        return (
          <button
            key={value}
            onClick={() => setPlatform(value)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-sm outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${
              active
                ? "bg-slate-900 text-white"
                : "border border-gray-300 text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
