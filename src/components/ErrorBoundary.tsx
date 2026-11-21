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
        <div className="min-h-screen bg-[#f4f8f8] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#e3ebec] rounded-2xl p-6 shadow-sm">
            <h1 className="text-xl font-extrabold text-[#12262e]">Something went wrong</h1>
            <p className="mt-2 text-sm text-[#42565c]">{this.state.message}</p>
            {this.state.details && (
              <pre className="mt-4 p-3 rounded-xl bg-[#f7fafb] border border-[#e3ebec] text-xs overflow-auto max-h-48 text-[#12262e]">
                {this.state.details}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-4 py-2.5 rounded-full bg-[#4d8a96] text-white text-sm font-bold hover:bg-[#3d7280] cursor-pointer"
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
