import React from 'react';

export default class PlayerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[PlayerErrorBoundary] Error atrapado en SmartPlayer:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-white text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold">Interrupción inesperada de reproducción</h2>
          <p className="text-sm text-neutral-400 max-w-md">
            {this.state.error?.message || 'Ocurrió un problema durante la reproducción.'}
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-5 py-2.5 bg-[#E50914] text-white rounded-lg text-sm font-bold hover:bg-red-700 transition"
            >
              Reintentar reproducción
            </button>
            <button
              onClick={this.props.onClose}
              className="px-5 py-2.5 bg-white/10 text-white rounded-lg text-sm font-bold hover:bg-white/20 transition"
            >
              Cerrar reproductor
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

