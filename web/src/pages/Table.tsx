import { data } from '@/lib/site'
import { SectionTitle } from '@/components/bits'
import { cn } from '@/lib/utils'

export default function Table() {
  return (
    <div className="max-w-3xl">
      <SectionTitle>Puan durumu</SectionTitle>
      <p className="text-[14px] text-muted-foreground -mt-1 mb-4">{data.club.season}</p>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full min-w-[420px] text-[15px] num">
          <thead>
            <tr className="eyebrow !text-[12px] text-left">
              <th className="py-2.5 pl-4 w-10">#</th><th className="py-2.5">Takım</th>
              <th className="py-2.5 text-right w-12">O</th><th className="py-2.5 text-right w-14">Av</th><th className="py-2.5 pr-4 text-right w-12">P</th>
            </tr>
          </thead>
          <tbody>
            {data.table.map(r => (
              <tr key={r.code} className={cn('border-t', r.us && 'bg-club text-clubink font-bold')}>
                <td className="py-2.5 pl-4">{r.rank}</td>
                <td className="py-2.5">{r.name}</td>
                <td className="py-2.5 text-right">{r.played}</td>
                <td className="py-2.5 text-right">{r.gd > 0 ? '+' + r.gd : r.gd}</td>
                <td className="py-2.5 pr-4 text-right font-bold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
