interface Props {
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPage: (page: number) => void;
}

export default function Pagination({ page, totalPages, hasNext, hasPrev, onPage }: Props) {
  const WINDOW = 5;
  const start = Math.max(1, Math.min(page - 2, totalPages - WINDOW + 1));
  const end   = Math.min(totalPages, start + WINDOW - 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div style={s.container}>
      <button style={s.btn} disabled={!hasPrev} onClick={() => onPage(1)}>«</button>
      <button style={s.btn} disabled={!hasPrev} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {pages.map(p => (
        <button key={p}
          style={{ ...s.btn, ...(p === page ? s.btnActive : {}) }}
          onClick={() => onPage(p)}>
          {p}
        </button>
      ))}
      <button style={s.btn} disabled={!hasNext} onClick={() => onPage(page + 1)}>Next ›</button>
      <button style={s.btn} disabled={!hasNext} onClick={() => onPage(totalPages)}>»</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' },
  btn:       { padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' },
  btnActive: { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.4)' },
};
