import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Primacor CAD ErrorBoundary capturou um erro:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            width: '100vw',
            backgroundColor: '#0a0c10',
            color: '#f3f6fc',
            padding: '24px',
            boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              background: '#11141a',
              border: '1px solid #232a3b',
              borderRadius: 12,
              padding: '28px 20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <AlertTriangle size={24} color="#ef4444" />
            </div>

            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#f3f6fc',
                margin: '0 0 8px 0',
                letterSpacing: '-0.01em',
              }}
            >
              Erro ao Inicializar o CAD
            </h2>

            <p
              style={{
                fontSize: 13,
                color: '#9aa5b9',
                margin: '0 0 16px 0',
                lineHeight: 1.5,
              }}
            >
              O motor gráfico encontrou uma instabilidade durante a renderização no seu dispositivo.
            </p>

            {this.state.error && (
              <div
                style={{
                  width: '100%',
                  background: '#060709',
                  border: '1px solid #1a1f2c',
                  borderRadius: 6,
                  padding: '10px 12px',
                  marginBottom: 20,
                  fontSize: 11,
                  color: '#ef4444',
                  fontFamily: 'monospace',
                  textAlign: 'left',
                  overflowX: 'auto',
                  maxHeight: 120,
                  boxSizing: 'border-box',
                }}
              >
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: '#00d2b4',
                  color: '#000000',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={15} />
                <span>Recarregar CAD</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.location.href = window.location.pathname;
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: '#161a22',
                  color: '#9aa5b9',
                  border: '1px solid #232a3b',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Home size={15} />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
