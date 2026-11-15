import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060913] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#0B1120] border border-red-500/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold">Application Error Intercepted</h2>
            </div>
            <p className="text-sm text-slate-300 break-words font-mono bg-[#060913] p-3 rounded-lg border border-slate-800">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Recover Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
