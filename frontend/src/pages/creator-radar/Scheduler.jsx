// Coming-soon scheduler view. No backend, no actual scheduler — the rows below are the
// INTENDED schedule structure. Every job currently runs manually via its npm command.
const JOBS = [
  {
    job: "Instagram refresh",
    command: "npm run fetch -- --force",
    frequency: "Weekly (Monday 06:00 UTC)",
    nextRun: "2026-07-20 06:00 UTC",
  },
  {
    job: "TikTok refresh",
    command: "npm run fetch:tiktok -- --force",
    frequency: "Weekly (Monday 06:00 UTC)",
    nextRun: "2026-07-20 06:00 UTC",
  },
  {
    job: "AI-relevance gate refresh",
    command: "npm run relevance",
    frequency: "After each refresh",
    nextRun: "Post-fetch",
  },
  {
    job: "Reclassification",
    command: "npm run classify -- --force",
    frequency: "After each gate refresh",
    nextRun: "Post-relevance",
  },
  {
    job: "Discovery: Instagram hashtag",
    command: "npm run discover",
    frequency: "Weekly (Sunday 12:00 UTC)",
    nextRun: "2026-07-19 12:00 UTC",
  },
];

export default function Scheduler() {
  return (
    <div className="cr-page u-mx-auto u-max-w-5xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Scheduler</h2>

      <div className="u-mt-4 u-rounded-lg u-border u-border-amber-200 u-bg-amber-50 u-px-4 u-py-3 u-text-sm u-text-amber-800">
        <span className="u-font-medium">Automated scheduling coming soon.</span> Currently all jobs run
        manually via npm commands. This view shows the intended schedule structure.
      </div>

      <div className="u-mt-4 u-overflow-x-auto u-rounded-xl u-border u-border-slate-200 u-bg-white">
        <table className="u-w-full u-text-sm">
          <thead>
            <tr className="u-border-b u-border-slate-200 u-text-left u-text-xs u-uppercase u-tracking-wide u-text-slate-500">
              <th className="u-px-4 u-py-3 u-font-medium">Job</th>
              <th className="u-px-4 u-py-3 u-font-medium">Command</th>
              <th className="u-px-4 u-py-3 u-font-medium">Frequency</th>
              <th className="u-px-4 u-py-3 u-font-medium">Next Run</th>
              <th className="u-px-4 u-py-3 u-font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {JOBS.map((j) => (
              <tr key={j.job} className="u-border-b u-border-slate-100 u-align-top u-last-border-0">
                <td className="u-px-4 u-py-3 u-font-medium u-text-slate-900">{j.job}</td>
                <td className="u-px-4 u-py-3">
                  <span className="u-rounded u-bg-slate-100 u-px-1_5 u-py-0_5 u-font-mono u-text-xs u-text-slate-600">{j.command}</span>
                </td>
                <td className="u-px-4 u-py-3 u-text-slate-600">{j.frequency}</td>
                <td className="u-px-4 u-py-3 u-text-slate-600">{j.nextRun}</td>
                <td className="u-px-4 u-py-3">
                  <span className="u-whitespace-nowrap u-rounded-full u-bg-amber-50 u-px-2 u-py-0_5 u-text-xs u-font-medium u-text-amber-700">
                    Not yet scheduled (manual only)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
