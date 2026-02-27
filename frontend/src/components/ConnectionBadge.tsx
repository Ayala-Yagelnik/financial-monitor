import type { ConnectionState } from '../store/transactionSlice';

interface Props {
  state: ConnectionState;
}

const CONFIG: Record<ConnectionState, { color: string; bg: string; label: string; anim?: string }> = {
  connected:    { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  label: '● Live'          },
  connecting:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: '◌ Connecting...', anim: 'pulse 1.5s infinite' },
  disconnected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: '○ Disconnected'  },
  error:        { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: '✕ Error'         },
};

export default function ConnectionBadge({ state }: Props) {
  const cfg = CONFIG[state];
  return (
    <div style={{
      padding: '0.5rem 1rem', borderRadius: 20, background: cfg.bg,
      color: cfg.color, fontWeight: 600, fontSize: '0.9rem', animation: cfg.anim,
    }}>
      {cfg.label}
    </div>
  );
}
