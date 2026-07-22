// App-level error boundary (React's built-in class-component pattern — no third-party lib).
// Catches render/lifecycle errors anywhere below it and shows a friendly fallback instead
// of white-screening the whole app.
//
// NOTE: "Report" copies the error details to the clipboard. There is no Anthropic feedback
// endpoint wired into this MVP, so we make Report do something honest and useful (copy the
// stack so the user can paste it into a bug report) rather than pretend to send it anywhere.
import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null, copied: false };

  static getDerivedStateFromError(error) {
    return { error, copied: false };
  }

  componentDidCatch(error, info) {
    // Surface to the console for developers; the fallback UI covers non-technical users.
    console.error("ErrorBoundary caught an error:", error, info?.componentStack);
  }

  handleReport = async () => {
    const { error } = this.state;
    const text = `Creator Radar error report\n\n${error?.message || "Unknown error"}\n\n${error?.stack || ""}`;
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong.</h1>
          <p className="mt-2 text-sm text-slate-600">
            Please refresh the page. If this keeps happening, click <strong>Report</strong> to
            copy the error details and send them to Anthropic feedback.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Refresh
            </button>
            <button
              onClick={this.handleReport}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              {copied ? "Copied ✓" : "Report"}
            </button>
          </div>

          {/* Dev-friendly, collapsed by default so it doesn't alarm non-technical users. */}
          <details className="mt-5">
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-400">
              Error details
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {error.message}
              {"\n\n"}
              {error.stack}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
