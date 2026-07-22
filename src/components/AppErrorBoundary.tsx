import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class AppErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] Uncaught render error:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div role="alert" style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>The app hit an error while loading</h1>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#b00020' }}>
          {this.state.error?.message ?? 'Unknown error'}
        </pre>
        <button onClick={this.handleReload}>Reload the application</button>
      </div>
    );
  }
}
