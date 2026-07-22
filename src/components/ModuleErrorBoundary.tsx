import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  moduleName: string;
  onReset: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ModuleErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ModuleErrorBoundary caught an error in module "${this.props.moduleName}":`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset();
  };

  public render() {
    if (this.state.hasError) {
      // Clean up module name for display (e.g., professor-desk -> Professor Desk)
      const formattedName = this.props.moduleName
        ? this.props.moduleName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        : 'Module';

      return (
        <div 
          id="module-error-boundary-view" 
          className="min-h-[60vh] flex flex-col items-center justify-center p-6 bg-slate-900 border border-red-500/10 rounded-2xl text-center shadow-2xl max-w-2xl mx-auto my-12"
        >
          <div className="bg-red-500/10 p-4 rounded-full mb-4">
            <svg 
              className="h-10 w-10 text-red-400" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          
          <h2 className="text-xl font-semibold text-red-400 mb-2 font-sans">
            [{formattedName}] failed to load
          </h2>
          
          <p className="text-sm text-slate-400 max-w-md mb-8 font-sans">
            An unexpected error occurred while running this application component. 
            {this.state.error && (
              <span className="block mt-2 font-mono text-xs text-red-300/80 bg-slate-950 p-2 rounded-lg max-h-24 overflow-y-auto">
                {this.state.error.message}
              </span>
            )}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <button
              id="error-boundary-refresh-btn"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-sm font-semibold font-sans bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-xl shadow-lg transition-colors cursor-pointer w-full sm:w-auto"
            >
              Refresh page
            </button>
            
            <button
              id="error-boundary-reset-btn"
              onClick={this.handleReset}
              className="px-5 py-2.5 text-sm font-semibold font-sans bg-slate-800 hover:bg-slate-700 active:bg-slate-950 text-slate-200 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer w-full sm:w-auto"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
