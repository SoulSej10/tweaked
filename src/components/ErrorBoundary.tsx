import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

/** If a screen crashes, show a friendly way out instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="splash">
        <p className="splash-emoji" aria-hidden>🥘</p>
        <h1>Oops, something burned</h1>
        <p className="muted">That screen hit a problem. Your recipes are safe.</p>
        <div className="row center wrap" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
          <a className="btn" href="/">Go home</a>
        </div>
      </main>
    )
  }
}
