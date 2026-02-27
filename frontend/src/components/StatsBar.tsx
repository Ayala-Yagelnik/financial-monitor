import { useState, useMemo } from 'react';
import type { DbStats } from '../store/transactionSlice';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', ILS: '₪', GBP: '£', JPY: '¥', BTC: '₿', ETH: 'Ξ',
};

interface Props {
  stats: DbStats;
  onRefresh: () => void;
}

export default function StatsBar({ stats, onRefresh }: Props) {
  const [showVolume, setShowVolume] = useState(false);
  const sortedCurrencies = useMemo(
    () => Object.entries(stats.volumeByCurrency).sort(([, a], [, b]) => b - a),
    [stats.volumeByCurrency],
  );

  return (
    <div style={s.bar}>
      <StatCard label="Total in DB"  value={stats.total.toLocaleString()}     color="#6366f1" />
      <StatCard label="Completed"    value={stats.completed.toLocaleString()} color="#10b981" />
      <StatCard label="Failed"       value={stats.failed.toLocaleString()}    color="#ef4444" />
      <StatCard label="Pending"      value={stats.pending.toLocaleString()}   color="#f59e0b" />

      <div style={{ ...s.statCard, cursor: 'pointer', gridColumn: 'span 2' }}
        onClick={() => setShowVolume(v => !v)}>
        <div style={s.volumeHeader}>
          Volume by Currency <span style={{ fontSize: '0.7rem' }}>{showVolume ? '▲' : '▼'}</span>
        </div>
        {showVolume ? (
          <div style={s.volumeGrid}>
            {sortedCurrencies.length === 0
              ? <span style={{ color: '#475569', fontSize: '0.85rem' }}>—</span>
              : sortedCurrencies.map(([cur, amt]) => (
                <div key={cur} style={s.volumeRow}>
                  <span style={s.currencyTag}>{cur}</span>
                  <span style={s.volumeAmt}>
                    {CURRENCY_SYMBOLS[cur] ?? ''}{amt.toLocaleString('en', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div style={s.volumeSummary}>
            {sortedCurrencies.slice(0, 3).map(([cur, amt]) => (
              <span key={cur} style={s.volumeChip}>
                <span style={s.currencyTag}>{cur}</span>
                {CURRENCY_SYMBOLS[cur] ?? ''}{amt.toLocaleString('en', { maximumFractionDigits: 0 })}
              </span>
            ))}
            {sortedCurrencies.length > 3 &&
              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>+{sortedCurrencies.length - 3}</span>}
          </div>
        )}
      </div>

      <button style={s.refreshBtn} onClick={onRefresh} title="Refresh stats from DB">
        ↻ Refresh
      </button>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={s.statCard}>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar:          { display: 'grid', gridTemplateColumns: 'repeat(4,1fr) 2fr auto', gap: '0.75rem', marginBottom: '1rem', alignItems: 'start' },
  statCard:     { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.75rem 1rem' },
  volumeHeader: { color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  volumeGrid:   { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  volumeRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  volumeSummary:{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' },
  volumeChip:   { display: 'flex', gap: '0.3rem', alignItems: 'center', color: '#e2e8f0', fontSize: '0.9rem' },
  currencyTag:  { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '0.1rem 0.4rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700 },
  volumeAmt:    { color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' },
  refreshBtn:   { padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem', alignSelf: 'start' },
};
