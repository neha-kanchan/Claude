import { useId, useState } from 'react';

/* A horizontal magnitude chart.

   Colour deliberately carries no meaning here: every bar is the same hue and
   identity comes from the row label beside it. Encoding these categories by hue
   would need a categorical palette, and the app's own status colours fail
   colourblind separation when placed adjacent (blue/violet ΔE 0.6 deutan;
   green/red ΔE 5.2 protan), so length is the only channel doing work.

   Each row is direct-labelled with its value, which is why there is no axis:
   the numbers are already on the page, and a table view is one click away. */
export function BarChart({ title, data, valueLabel = 'count', emptyText = 'No data yet.' }) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className="card p-4" aria-labelledby={titleId}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
        <button type="button" onClick={() => setAsTable((v) => !v)}
          className="text-xs font-semibold underline" style={{ color: 'var(--leaf)' }}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </header>

      {data.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>{emptyText}</p>
      ) : asTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--line)' }}>
              <th scope="col" className="py-1.5 text-left text-xs font-semibold uppercase" style={{ color: 'var(--ink-soft)' }}>Category</th>
              <th scope="col" className="py-1.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--ink-soft)' }}>{valueLabel}</th>
              <th scope="col" className="py-1.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--ink-soft)' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1.5">{d.label}</td>
                <td className="tnum py-1.5 text-right font-medium">{d.value}</td>
                <td className="tnum py-1.5 text-right" style={{ color: 'var(--ink-soft)' }}>
                  {total ? Math.round((d.value / total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="grid gap-2">
          {data.map((d) => (
            <li key={d.label} className="grid grid-cols-[minmax(90px,34%)_1fr_auto] items-center gap-2.5"
              title={`${d.label}: ${d.value} ${valueLabel}${total ? ` (${Math.round((d.value / total) * 100)}%)` : ''}`}>
              <span className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>{d.label}</span>
              <span className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
                {/* 4px rounded data-end, anchored at the baseline */}
                <span className="block h-full rounded-full transition-[width]"
                  style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: 'var(--leaf)' }} />
              </span>
              <span className="tnum w-8 text-right text-xs font-semibold">{d.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
