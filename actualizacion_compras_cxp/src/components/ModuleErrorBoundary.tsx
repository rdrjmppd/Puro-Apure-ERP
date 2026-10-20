import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Error in ${this.props.moduleName || 'Module'}]:`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-slate-900 border border-red-800/60 rounded-3xl text-center space-y-4 my-4 animate-fadeIn">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-950/80 border border-red-700 flex items-center justify-center text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Error al cargar {this.props.moduleName || 'el submódulo'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Se ha aislado el error para garantizar que el resto del sistema siga operando con total estabilidad.
            </p>
            {this.state.error && (
              <div className="text-[11px] font-mono text-red-400/90 mt-2 bg-slate-950 p-2 rounded-xl max-w-lg mx-auto truncate">
                {this.state.error.message}
              </div>
            )}
          </div>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reintentar carga</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
