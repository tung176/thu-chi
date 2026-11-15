import { Component, type ReactNode } from 'react'

/** Bắt lỗi khi vẽ giao diện: hiện hộp báo lỗi thay vì để màn hình trắng. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    window.__fatal?.('Giao diện của app bị lỗi.', error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
