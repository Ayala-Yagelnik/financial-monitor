import { useState, useMemo, useCallback } from 'react';
import { useTransactionHub } from '../hooks/useTransactionHub';
import type { PagedTransactions } from '../hooks/useTransactionHub';
import { STATUS_CONFIG, TRANSACTION_STATUSES } from '../types/transaction';
import type { Transaction, TransactionStatus } from '../types/transaction';

const ANIMATION_STYLE = `
  @keyframes slideIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .tx-row { animation: slideIn 0.2s ease-out; }
`;

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD:'$', EUR:'€', ILS:'₪', GBP:'£', JPY:'¥', BTC:'₿', ETH:'Ξ',
};

type FilterOption = 'All' | TransactionStatus;
type ViewMode = 'live' | 'history';
const FILTERS: FilterOption[] = ['All', ...TRANSACTION_STATUSES];
const PAGE_SIZE = 50;

export default function Monitor() {
  const {
    recentTransactions, connectionState, clearRecent,
    dbStats, refreshStats, fetchPage,
  } = useTransactionHub();

  // Live feed state
  const [liveFilter, setLiveFilter]   = useState<FilterOption>('All');
  const [searchText, setSearchText]   = useState('');

  // History (pagination) state
  const [viewMode, setViewMode]       = useState<ViewMode>('live');
  const [historyFilter, setHistoryFilter] = useState<FilterOption>('All');
  const [currentPage, setCurrentPage] = useState<PagedTransactions | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [isLoading, setIsLoading]     = useState(false);

  // Volume accordion
  const [showVolume, setShowVolume]   = useState(false);

  // Filter the live feed
  const filteredRecent = useMemo(() =>
    recentTransactions.filter(tx => {
      const matchFilter = liveFilter === 'All' || tx.status === liveFilter;
      const matchSearch = !searchText ||
        tx.transactionId.toLowerCase().includes(searchText.toLowerCase()) ||
        tx.currency.toLowerCase().includes(searchText.toLowerCase());
      return matchFilter && matchSearch;
    }),
    [recentTransactions, liveFilter, searchText]
  );

  // Load history page
  const loadPage = useCallback(async (page: number, filter: FilterOption) => {
    setIsLoading(true);
    try {
      const status = filter === 'All' ? undefined : filter as TransactionStatus;
      const result = await fetchPage(page, PAGE_SIZE, status);
      setCurrentPage(result);
      setHistoryPage(page);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPage]);

  const switchToHistory = async () => {
    setViewMode('history');
    await loadPage(1, historyFilter);
  };

  const sortedCurrencies = useMemo(() =>
    Object.entries(dbStats.volumeByCurrency).sort(([,a],[,b]) => b - a),
    [dbStats.volumeByCurrency]
  );

  return (
    <>
      <style>{ANIMATION_STYLE}</style>
      <div style={s.container}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Live Monitor</h1>
            <p style={s.subtitle}>Real-time transaction feed</p>
          </div>
          <ConnectionBadge state={connectionState} />
        </div>

        {/* DB Stats — always displayed, remain after clear */}
        <div style={s.sectionLabel}>📊 Database</div>
        <div style={s.dbStatsBar}>
          <StatCard label="Total in DB"  value={dbStats.total.toLocaleString()}     color="#6366f1" />
          <StatCard label="Completed"    value={dbStats.completed.toLocaleString()} color="#10b981" />
          <StatCard label="Failed"       value={dbStats.failed.toLocaleString()}    color="#ef4444" />
          <StatCard label="Pending"      value={dbStats.pending.toLocaleString()}   color="#f59e0b" />

          {/* Volume accordion */}
          <div style={{...s.statCard, cursor:'pointer', gridColumn:'span 2'}}
            onClick={() => setShowVolume(v => !v)}>
            <div style={s.volumeHeader}>
              Volume by Currency <span style={{fontSize:'0.7rem'}}>{showVolume ? '▲' : '▼'}</span>
            </div>
            {showVolume ? (
              <div style={s.volumeGrid}>
                {sortedCurrencies.length === 0
                  ? <span style={{color:'#475569', fontSize:'0.85rem'}}>—</span>
                  : sortedCurrencies.map(([cur, amt]) => (
                    <div key={cur} style={s.volumeRow}>
                      <span style={s.currencyTag}>{cur}</span>
                      <span style={s.volumeAmt}>
                        {CURRENCY_SYMBOLS[cur] ?? ''}{amt.toLocaleString('en',{maximumFractionDigits:2})}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div style={s.volumeSummary}>
                {sortedCurrencies.slice(0,3).map(([cur,amt]) => (
                  <span key={cur} style={s.volumeChip}>
                    <span style={s.currencyTag}>{cur}</span>
                    {CURRENCY_SYMBOLS[cur] ?? ''}{amt.toLocaleString('en',{maximumFractionDigits:0})}
                  </span>
                ))}
                {sortedCurrencies.length > 3 &&
                  <span style={{color:'#64748b',fontSize:'0.8rem'}}>+{sortedCurrencies.length-3}</span>}
              </div>
            )}
          </div>

          <button style={s.refreshBtn} onClick={refreshStats} title="Refresh stats from DB">
            ↻ Refresh
          </button>
        </div>

        {/* View Mode Tabs */}
        <div style={s.tabs}>
          <button style={{...s.tab, ...(viewMode==='live' ? s.tabActive : {})}}
            onClick={() => setViewMode('live')}>
            ⚡ Live Feed
            <span style={s.tabBadge}>{recentTransactions.length}</span>
          </button>
          <button style={{...s.tab, ...(viewMode==='history' ? s.tabActive : {})}}
            onClick={switchToHistory}>
            📋 Full History
            <span style={s.tabBadge}>{dbStats.total.toLocaleString()}</span>
          </button>
        </div>

        {/* ═══════════ LIVE FEED ═══════════ */}
        {viewMode === 'live' && (
          <>
            <div style={s.controls}>
              <input style={s.searchInput}
                placeholder="🔍  Search by ID or currency..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)} />
              <div style={s.filterGroup}>
                {FILTERS.map(f => (
                  <button key={f} onClick={() => setLiveFilter(f)}
                    style={{
                      ...s.filterBtn,
                      ...(liveFilter===f ? s.filterBtnActive : {}),
                      ...(f!=='All' ? {color: STATUS_CONFIG[f as TransactionStatus]?.color} : {})
                    }}>
                    {f}
                  </button>
                ))}
              </div>
              <button style={s.clearBtn} onClick={clearRecent}
                title="Clears display only — DB is preserved">
                🗑 Clear
              </button>
            </div>

            <div style={s.countLabel}>
              Showing {filteredRecent.length} of {recentTransactions.length} recent
              {dbStats.total > recentTransactions.length &&
                <span style={{color:'#6366f1'}}> ({dbStats.total.toLocaleString()} total in DB →
                  <button style={s.inlineBtn} onClick={switchToHistory}>view all</button>
                )</span>
              }
            </div>

            {recentTransactions.length === 0 && (
              <div style={s.emptyState}>
                <div style={{fontSize:'3rem',marginBottom:'1rem'}}>📡</div>
                <p style={{color:'#94a3b8'}}>
                  {dbStats.total > 0
                    ? `Display cleared — ${dbStats.total.toLocaleString()} transactions in DB`
                    : 'Waiting for transactions...'}
                </p>
              </div>
            )}

            <div style={s.grid}>
              {filteredRecent.map(tx => (
                <TransactionRow key={tx.transactionId} transaction={tx} />
              ))}
            </div>
          </>
        )}

        {/* ═══════════ HISTORY (PAGINATION) ═══════════ */}
        {viewMode === 'history' && (
          <>
            <div style={s.controls}>
              <div style={s.filterGroup}>
                {FILTERS.map(f => (
                  <button key={f}
                    onClick={async () => {
                      setHistoryFilter(f);
                      await loadPage(1, f);
                    }}
                    style={{
                      ...s.filterBtn,
                      ...(historyFilter===f ? s.filterBtnActive : {}),
                      ...(f!=='All' ? {color: STATUS_CONFIG[f as TransactionStatus]?.color} : {})
                    }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {isLoading && (
              <div style={s.loadingBanner}>⏳ Loading...</div>
            )}

            {currentPage && !isLoading && (
              <>
                <div style={s.countLabel}>
                  Page {currentPage.page} of {currentPage.totalPages}
                  ({currentPage.totalCount.toLocaleString()} total)
                </div>

                <div style={s.grid}>
                  {currentPage.items.map(tx => (
                    <TransactionRow key={tx.transactionId} transaction={tx} />
                  ))}
                </div>

                {/* Pagination Controls */}
                <div style={s.pagination}>
                  <button style={s.pageBtn}
                    disabled={!currentPage.hasPrev}
                    onClick={() => loadPage(1, historyFilter)}>
                    «
                  </button>
                  <button style={s.pageBtn}
                    disabled={!currentPage.hasPrev}
                    onClick={() => loadPage(currentPage.page - 1, historyFilter)}>
                    ‹ Prev
                  </button>

                  {/* Page numbers */}
                  {(() => {
                    const total = currentPage.totalPages;
                    const cur   = currentPage.page;
                    const WINDOW = 5;
                    // Window starting 2 before current, adjusts to edges
                    const start = Math.max(1, Math.min(cur - 2, total - WINDOW + 1));
                    const end   = Math.min(total, start + WINDOW - 1);
                    return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
                      <button key={p} style={{
                        ...s.pageBtn,
                        ...(p === cur ? s.pageBtnActive : {})
                      }}
                        onClick={() => loadPage(p, historyFilter)}>
                        {p}
                      </button>
                    ));
                  })()}

                  <button style={s.pageBtn}
                    disabled={!currentPage.hasNext}
                    onClick={() => loadPage(currentPage.page + 1, historyFilter)}>
                    Next ›
                  </button>
                  <button style={s.pageBtn}
                    disabled={!currentPage.hasNext}
                    onClick={() => loadPage(currentPage.totalPages, historyFilter)}>
                    »
                  </button>
                </div>
              </>
            )}
          </>
        )}

      </div>
    </>
  );
}

function TransactionRow({ transaction: tx }: { transaction: Transaction }) {
  const cfg  = STATUS_CONFIG[tx.status];
  const sym  = CURRENCY_SYMBOLS[tx.currency] ?? '';
  const time = new Date(tx.timestamp).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return (
    <div className="tx-row" style={s.row}>
      <div style={{...s.statusBadge, background:cfg.bg, color:cfg.color}}>{cfg.label}</div>
      <div style={s.txId}>{tx.transactionId.substring(0,8)}...</div>
      <div style={s.amount}>
        <span style={s.amountNum}>{sym}{tx.amount.toLocaleString('en',{minimumFractionDigits:2})}</span>
        <span style={s.currency}>{tx.currency}</span>
      </div>
      <div style={s.timestamp}>{time}</div>
    </div>
  );
}

function ConnectionBadge({state}:{state:string}) {
  const cfg = ({
    connected:   {color:'#10b981',bg:'rgba(16,185,129,0.1)',label:'● Live',         anim:undefined},
    connecting:  {color:'#f59e0b',bg:'rgba(245,158,11,0.1)', label:'◌ Connecting...',anim:'pulse 1.5s infinite'},
    disconnected:{color:'#ef4444',bg:'rgba(239,68,68,0.1)',  label:'○ Disconnected',anim:undefined},
    error:       {color:'#ef4444',bg:'rgba(239,68,68,0.1)',  label:'✕ Error',        anim:undefined},
  } as Record<string,{color:string;bg:string;label:string;anim:string|undefined}>)[state]
    ?? {color:'#94a3b8',bg:'transparent',label:state,anim:undefined};
  return (
    <div style={{padding:'0.5rem 1rem',borderRadius:20,background:cfg.bg,color:cfg.color,
      fontWeight:600,fontSize:'0.9rem',animation:cfg.anim}}>
      {cfg.label}
    </div>
  );
}

function StatCard({label,value,color}:{label:string;value:string|number;color:string}) {
  return (
    <div style={s.statCard}>
      <div style={{fontSize:'1.3rem',fontWeight:700,color,lineHeight:1}}>{value}</div>
      <div style={{color:'#64748b',fontSize:'0.7rem',marginTop:'0.3rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container:    {maxWidth:1000,margin:'0 auto',padding:'2rem 1rem'},
  header:       {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.5rem'},
  title:        {fontSize:'2rem',fontWeight:700,color:'#f1f5f9',margin:0},
  subtitle:     {color:'#94a3b8',marginTop:'0.25rem'},
  sectionLabel: {color:'#475569',fontSize:'0.75rem',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'0.5rem',marginTop:'1rem'},
  dbStatsBar:   {display:'grid',gridTemplateColumns:'repeat(4,1fr) 2fr auto',gap:'0.75rem',marginBottom:'1rem',alignItems:'start'},
  statCard:     {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:'0.75rem 1rem'},
  volumeHeader: {color:'#94a3b8',fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'0.4rem'},
  volumeGrid:   {display:'flex',flexDirection:'column',gap:'0.4rem'},
  volumeRow:    {display:'flex',justifyContent:'space-between',alignItems:'center'},
  volumeSummary:{display:'flex',gap:'0.75rem',flexWrap:'wrap',alignItems:'center'},
  volumeChip:   {display:'flex',gap:'0.3rem',alignItems:'center',color:'#e2e8f0',fontSize:'0.9rem'},
  currencyTag:  {background:'rgba(99,102,241,0.2)',color:'#a5b4fc',padding:'0.1rem 0.4rem',borderRadius:4,fontSize:'0.75rem',fontWeight:700},
  volumeAmt:    {color:'#e2e8f0',fontWeight:600,fontSize:'0.9rem'},
  refreshBtn:   {padding:'0.5rem 0.75rem',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#64748b',cursor:'pointer',fontSize:'0.8rem',alignSelf:'start'},
  tabs:         {display:'flex',gap:'0.5rem',marginBottom:'1rem',borderBottom:'1px solid rgba(255,255,255,0.08)',paddingBottom:'0'},
  tab:          {padding:'0.6rem 1.2rem',background:'transparent',border:'none',color:'#64748b',cursor:'pointer',fontSize:'0.9rem',fontWeight:500,borderBottom:'2px solid transparent',marginBottom:'-1px',display:'flex',gap:'0.5rem',alignItems:'center'},
  tabActive:    {color:'#f1f5f9',borderBottomColor:'#6366f1'},
  tabBadge:     {background:'rgba(99,102,241,0.2)',color:'#a5b4fc',padding:'0.1rem 0.5rem',borderRadius:10,fontSize:'0.75rem'},
  controls:     {display:'flex',gap:'0.75rem',marginBottom:'0.75rem',flexWrap:'wrap',alignItems:'center'},
  searchInput:  {flex:1,minWidth:200,background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'0.6rem 1rem',color:'#f1f5f9',fontSize:'0.9rem',outline:'none'},
  filterGroup:  {display:'flex',gap:'0.5rem'},
  filterBtn:    {padding:'0.5rem 1rem',borderRadius:20,border:'1px solid rgba(255,255,255,0.12)',background:'transparent',color:'#94a3b8',cursor:'pointer',fontSize:'0.85rem',fontWeight:500},
  filterBtnActive:{background:'rgba(255,255,255,0.1)',color:'#f1f5f9',borderColor:'rgba(255,255,255,0.25)'},
  clearBtn:     {padding:'0.5rem 1rem',borderRadius:8,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.1)',color:'#fca5a5',cursor:'pointer',fontSize:'0.85rem'},
  countLabel:   {color:'#64748b',fontSize:'0.8rem',marginBottom:'0.75rem'},
  inlineBtn:    {background:'none',border:'none',color:'#818cf8',cursor:'pointer',textDecoration:'underline',fontSize:'inherit',padding:'0 0.25rem'},
  loadingBanner:{background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8,padding:'0.75rem',textAlign:'center',color:'#a5b4fc',marginBottom:'1rem'},
  emptyState:   {textAlign:'center',padding:'4rem 2rem',color:'#475569'},
  grid:         {display:'flex',flexDirection:'column',gap:'0.4rem'},
  row:          {display:'grid',gridTemplateColumns:'130px 1fr 1fr auto',alignItems:'center',gap:'1rem',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'0.75rem 1rem'},
  statusBadge:  {padding:'0.3rem 0.7rem',borderRadius:20,fontSize:'0.75rem',fontWeight:700,letterSpacing:'0.05em',textAlign:'center'},
  txId:         {color:'#94a3b8',fontFamily:'monospace',fontSize:'0.85rem'},
  amount:       {display:'flex',alignItems:'baseline',gap:'0.4rem'},
  amountNum:    {color:'#f1f5f9',fontWeight:700,fontSize:'1.05rem'},
  currency:     {color:'#64748b',fontSize:'0.8rem'},
  timestamp:    {color:'#64748b',fontSize:'0.8rem',fontFamily:'monospace',whiteSpace:'nowrap'},
  pagination:   {display:'flex',gap:'0.5rem',justifyContent:'center',marginTop:'1.5rem',flexWrap:'wrap'},
  pageBtn:      {padding:'0.5rem 0.75rem',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.04)',color:'#94a3b8',cursor:'pointer',fontSize:'0.85rem'},
  pageBtnActive:{background:'rgba(99,102,241,0.2)',color:'#a5b4fc',borderColor:'rgba(99,102,241,0.4)'},
};
