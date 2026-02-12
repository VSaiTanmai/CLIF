"use client";

import React from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback component — defaults to built-in error UI */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
  /** Track retry count to prevent infinite crash loops */
  retryCount: number;
}

/** Maximum retry attempts before showing permanent error */
const MAX_RETRIES = 3;

/**
 * Production-grade React Error Boundary.
 *
 * Catches render-time errors in the component tree below it,
 * prevents full page crashes, and provides a retry mechanism
 * with a built-in retry limit to prevent infinite crash loops.
 * In production, error details are hidden to prevent info leakage.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "", retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Structured error logging — in production this would go to Sentry/DataDog
    console.error(
      JSON.stringify({
        level: "error",
        msg: "React ErrorBoundary caught error",
        service: "clif-dashboard",
        ts: new Date().toISOString(),
        error: error.message,
        componentStack: errorInfo.componentStack?.slice(0, 500),
      }),
    );
    this.setState({
      errorInfo: errorInfo.componentStack?.slice(0, 500) ?? "",
    });
  }

  handleReset = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: "",
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const canRetry = this.state.retryCount < MAX_RETRIES;

      return (
        <div
          className="flex min-h-[400px] flex-col items-center justify-center space-y-4 rounded-lg border border-destructive/20 bg-destructive/5 p-8"
          role="alert"
          aria-live="assertive"
        >
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {canRetry
                ? "An unexpected error occurred in this component. The rest of the application is unaffected."
                : "This component has crashed repeatedly. Please refresh the page or contact support."}
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre className="mt-3 max-h-32 max-w-lg overflow-auto rounded-md bg-background p-3 text-left font-mono text-[11px] text-destructive">
                {this.state.error.message}
                {this.state.errorInfo &&
                  `\n\nComponent Stack:${this.state.errorInfo}`}
              </pre>
            )}
          </div>
          {canRetry ? (
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RefreshCcw className="h-4 w-4" />
              Try Again ({MAX_RETRIES - this.state.retryCount} left)
            </button>
          ) : (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RefreshCcw className="h-4 w-4" />
              Reload Page
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Page-level error boundary wrapper with route-aware recovery.
 * Wraps each page to isolate crashes from affecting navigation.
 */
export function PageErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
