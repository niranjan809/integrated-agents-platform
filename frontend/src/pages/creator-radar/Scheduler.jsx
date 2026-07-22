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
    <div className="mx-auto max-w-5xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Scheduler</h2>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="font-medium">Automated scheduling coming soon.</span> Currently all jobs run
        manually via npm commands. This view shows the intended schedule structure.
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Command</th>
              <th className="px-4 py-3 font-medium">Frequency</th>
              <th className="px-4 py-3 font-medium">Next Run</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {JOBS.map((j) => (
              <tr key={j.job} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{j.job}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{j.command}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{j.frequency}</td>
                <td className="px-4 py-3 text-slate-600">{j.nextRun}</td>
                <td className="px-4 py-3">
                  <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
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
