import React from 'react';

interface State {
  hasError: boolean;
  message: string;
  details?: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'An unexpected application error occurred.';
    let details: string | undefined;
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed === 'object' && 'operationType' in parsed) {
        message = `Database ${parsed.operationType} error${parsed.path ? ` on ${parsed.path}` : ''}: ${parsed.error}`;
        details = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // Non-JSON error message
    }
    return { hasError: true, message, details };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#D8DFD9] rounded-xl p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#426F77]">
              FourClinic System Notice
            </p>
            <h1 className="mt-2 font-editorial text-3xl text-[#102E34]">
              Something interrupted this view
            </h1>
            <p className="mt-3 text-sm text-[#3B5257] leading-relaxed">{this.state.message}</p>
            {this.state.details && (
              <pre className="mt-4 p-3.5 rounded-lg bg-[#F7F5F0] border border-[#D8DFD9] text-xs font-mono overflow-auto max-h-48 text-[#102E34]">
                {this.state.details}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 px-5 py-2.5 rounded-lg bg-[#102E34] text-white text-sm font-semibold hover:bg-[#194149] transition cursor-pointer"
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
