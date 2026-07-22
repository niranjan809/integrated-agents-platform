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
      <div className="u-flex u-min-h-screen u-items-center u-justify-center u-bg-slate-50 u-px-4">
        <div className="u-w-full u-max-w-lg u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-8 u-shadow-sm">
          <h1 className="u-text-lg u-font-semibold u-text-slate-900">Something went wrong.</h1>
          <p className="u-mt-2 u-text-sm u-text-slate-600">
            Please refresh the page. If this keeps happening, click <strong>Report</strong> to
            copy the error details and send them to Anthropic feedback.
          </p>

          <div className="u-mt-4 u-flex u-items-center u-gap-3">
            <button
              onClick={() => window.location.reload()}
              className="u-rounded-md u-bg-slate-900 u-px-3 u-py-1_5 u-text-sm u-font-medium u-text-white u-hover-bg-slate-800"
            >
              Refresh
            </button>
            <button
              onClick={this.handleReport}
              className="u-rounded-md u-border u-border-slate-300 u-px-3 u-py-1_5 u-text-sm u-text-slate-700 u-hover-bg-slate-100"
            >
              {copied ? "Copied ✓" : "Report"}
            </button>
          </div>

          {/* Dev-friendly, collapsed by default so it doesn't alarm non-technical users. */}
          <details className="u-mt-5">
            <summary className="u-cursor-pointer u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-400">
              Error details
            </summary>
            <pre className="u-mt-2 u-max-h-64 u-overflow-auto u-whitespace-pre-wrap u-rounded-md u-bg-slate-50 u-p-3 u-text-xs u-text-slate-600">
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
