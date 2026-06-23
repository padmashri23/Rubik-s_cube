/**
 * ErrorBoundary — keeps a runtime error in one page from blanking the whole app.
 * Shows a friendly recovery card instead of an empty screen.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it in the console for debugging.
    console.error('CubeGuide caught a render error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div className="glass" style={{ padding: 36, maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem' }} aria-hidden>
            🧩
          </div>
          <h1 style={{ margin: '8px 0 6px' }}>Something glitched</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>
            A part of CubeGuide ran into an error. Your progress is safe — try again or head
            back home.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={this.reset}>
              Try again
            </button>
            <a className="btn" href="/">
              Go home
            </a>
          </div>
          <pre
            style={{
              marginTop: 18,
              textAlign: 'left',
              fontSize: '0.75rem',
              color: 'var(--text-faint)',
              whiteSpace: 'pre-wrap',
              maxHeight: 120,
              overflow: 'auto',
            }}
          >
            {error.message}
          </pre>
        </div>
      </div>
    );
  }
}
