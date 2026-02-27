import { useRef, useEffect, useState } from 'react';
import { STATUS_CONFIG } from '../types/transaction';
import type { Transaction } from '../types/transaction';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', ILS: '₪', GBP: '£', JPY: '¥', BTC: '₿', ETH: 'Ξ',
};

// Inject keyframes once
const STYLE = `
  @keyframes slideIn     { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
  @keyframes statusFlash { 0% { opacity:1 } 30% { opacity:0.2 } 100% { opacity:1 } }
  @keyframes rowHighlight { 0%,100% { background: rgba(255,255,255,0.04) } 40% { background: rgba(99,102,241,0.12) } }
`;
if (typeof document !== 'undefined' && !document.getElementById('tx-row-styles')) {
  const el = document.createElement('style');
  el.id = 'tx-row-styles';
  el.textContent = STYLE;
  document.head.appendChild(el);
}

interface Props {
  transaction: Transaction;
}

export default function TransactionRow({ transaction: tx }: Props) {
  const cfg  = STATUS_CONFIG[tx.status];
  const sym  = CURRENCY_SYMBOLS[tx.currency] ?? '';
  const time = new Date(tx.timestamp).toLocaleTimeString('en', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  // Track previous status to detect changes
  const prevStatusRef = useRef(tx.status);
  const [statusChanged, setStatusChanged] = useState(false);
  const [isNew] = useState(true); // always true on mount — row was just added

  useEffect(() => {
    if (prevStatusRef.current !== tx.status) {
      prevStatusRef.current = tx.status;
      setStatusChanged(true);
      // Remove flag after animation completes
      const t = setTimeout(() => setStatusChanged(false), 600);
      return () => clearTimeout(t);
    }
  }, [tx.status]);

  const rowAnimation = isNew ? 'slideIn 0.25s ease-out' : undefined;
  const rowHighlight = statusChanged ? 'rowHighlight 0.6s ease-out' : undefined;
  const badgeAnimation = statusChanged ? 'statusFlash 0.6s ease-out' : undefined;

  return (
    <div style={{
      ...s.row,
      animation: rowHighlight ?? rowAnimation,
    }}>
      <div style={{
        ...s.statusBadge,
        background: cfg.bg,
        color: cfg.color,
        animation: badgeAnimation,
        transition: 'background 0.3s ease, color 0.3s ease',
      }}>
        {cfg.label}
      </div>
      <div style={s.txId}>{tx.transactionId.substring(0, 8)}...</div>
      <div style={s.amount}>
        <span style={s.amountNum}>
          {sym}{tx.amount.toLocaleString('en', { minimumFractionDigits: 2 })}
        </span>
        <span style={s.currency}>{tx.currency}</span>
      </div>
      <div style={s.timestamp}>{time}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  row:         { display: 'grid', gridTemplateColumns: '130px 1fr 1fr auto', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '0.75rem 1rem' },
  statusBadge: { padding: '0.3rem 0.7rem', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textAlign: 'center' },
  txId:        { color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.85rem' },
  amount:      { display: 'flex', alignItems: 'baseline', gap: '0.4rem' },
  amountNum:   { color: '#f1f5f9', fontWeight: 700, fontSize: '1.05rem' },
  currency:    { color: '#64748b', fontSize: '0.8rem' },
  timestamp:   { color: '#64748b', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'nowrap' },
};
