import { Component, type ReactNode } from 'react'

/** Bir sayfada beklenmedik hata olursa tüm site beyaz ekrana düşmesin */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { hata: boolean }> {
  state = { hata: false }
  static getDerivedStateFromError() { return { hata: true } }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.hata) this.setState({ hata: false })
  }
  render() {
    if (!this.state.hata) return this.props.children
    return (
      <div className="max-w-md py-10">
        <h2 className="font-display text-[26px]">Bu sayfa açılamadı</h2>
        <p className="text-muted-foreground mt-2">Sayfayı yenilemeyi deneyin. Sorun sürerse başka bir sekmeden devam edebilirsiniz.</p>
        <button onClick={() => location.reload()} className="mt-4 px-4 py-2.5 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[14px]">Yenile</button>
      </div>
    )
  }
}
