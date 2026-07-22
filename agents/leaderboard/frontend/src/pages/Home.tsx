import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, DomainCategory, getCached } from "@/lib/api";

const COLOR_MAP: Record<string, { border: string; gradient: string; iconBg: string; accent: string }> = {
  purple:  { border: "border-purple-700/50 hover:border-purple-500/70",  gradient: "from-purple-900/40 to-purple-800/20",  iconBg: "bg-purple-900/60",  accent: "text-purple-400 group-hover:text-purple-300" },
  indigo:  { border: "border-indigo-700/50 hover:border-indigo-500/70",  gradient: "from-indigo-900/40 to-indigo-800/20",  iconBg: "bg-indigo-900/60",  accent: "text-indigo-400 group-hover:text-indigo-300" },
  emerald: { border: "border-emerald-700/50 hover:border-emerald-500/70", gradient: "from-emerald-900/40 to-emerald-800/20", iconBg: "bg-emerald-900/60", accent: "text-emerald-400 group-hover:text-emerald-300" },
  amber:   { border: "border-amber-700/50 hover:border-amber-500/70",   gradient: "from-amber-900/40 to-amber-800/20",   iconBg: "bg-amber-900/60",   accent: "text-amber-400 group-hover:text-amber-300" },
  rose:    { border: "border-rose-700/50 hover:border-rose-500/70",     gradient: "from-rose-900/40 to-rose-800/20",     iconBg: "bg-rose-900/60",    accent: "text-rose-400 group-hover:text-rose-300" },
  cyan:    { border: "border-cyan-700/50 hover:border-cyan-500/70",     gradient: "from-cyan-900/40 to-cyan-800/20",     iconBg: "bg-cyan-900/60",    accent: "text-cyan-400 group-hover:text-cyan-300" },
  violet:  { border: "border-violet-700/50 hover:border-violet-500/70", gradient: "from-violet-900/40 to-violet-800/20", iconBg: "bg-violet-900/60",  accent: "text-violet-400 group-hover:text-violet-300" },
  orange:  { border: "border-orange-700/50 hover:border-orange-500/70", gradient: "from-orange-900/40 to-orange-800/20", iconBg: "bg-orange-900/60",  accent: "text-orange-400 group-hover:text-orange-300" },
  teal:    { border: "border-teal-700/50 hover:border-teal-500/70",     gradient: "from-teal-900/40 to-teal-800/20",     iconBg: "bg-teal-900/60",    accent: "text-teal-400 group-hover:text-teal-300" },
  sky:     { border: "border-sky-700/50 hover:border-sky-500/70",       gradient: "from-sky-900/40 to-sky-800/20",       iconBg: "bg-sky-900/60",     accent: "text-sky-400 group-hover:text-sky-300" },
  lime:    { border: "border-lime-700/50 hover:border-lime-500/70",     gradient: "from-lime-900/40 to-lime-800/20",     iconBg: "bg-lime-900/60",    accent: "text-lime-400 group-hover:text-lime-300" },
};

function colors(accent: string) {
  return COLOR_MAP[accent] ?? COLOR_MAP.indigo;
}

export default function Home() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<DomainCategory[]>(
    () => getCached<DomainCategory[]>("/domain-categories") ?? []
  );

  useEffect(() => {
    api.listDomainCategories().then(setCategories);
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12 mt-8">
        <h1 className="text-4xl font-bold text-gray-100 mb-3">AI Leaderboard Agent</h1>
        <p className="text-zinc-400 text-lg">Discover and explore AI benchmarks across every domain.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {categories.map((cat) => {
          const c = colors(cat.accent_color);
          const count = cat.leaderboard_count;
          return (
            <button
              key={cat.slug}
              onClick={() => navigate(`/domain/${cat.slug}`)}
              className={`group text-left p-6 rounded-2xl border bg-linear-to-br ${c.gradient} ${c.border} transition-all duration-200 hover:scale-[1.02] hover:shadow-xl`}
            >
              <div className={`${c.iconBg} w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4`}>
                {cat.icon}
              </div>
              <h2 className="text-lg font-bold text-gray-100 mb-2 group-hover:text-white">{cat.name}</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">{cat.description}</p>
              {count > 0 && (
                <p className="text-xs text-gray-500 mb-3">{count} leaderboard{count !== 1 ? "s" : ""}</p>
              )}
              <span className={`text-sm font-medium ${c.accent} transition-colors`}>Explore →</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
