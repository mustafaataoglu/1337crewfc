import type { Nav } from '@/App'
import { acikMac } from '@/lib/site'
import { TaraftarSekme, TahminFormu, TahminLigi } from '@/components/taraftar'

export default function Tahmin({ nav }: { nav: Nav }) {
  const next = acikMac()
  return (
    <div>
      <TaraftarSekme aktif="tahmin" nav={nav} />
      <div className="grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-8">
        <div className="min-w-0">
          {next ? <TahminFormu m={next} /> : <p className="text-muted-foreground">Fikstürde sıradaki maç yok.</p>}
        </div>
        <div className="min-w-0">
          <TahminLigi />
        </div>
      </div>
    </div>
  )
}
