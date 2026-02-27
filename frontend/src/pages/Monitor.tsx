import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTransactionHub } from '../hooks/useTransactionHub';
import {
  selectRecentTransactions,
  selectDbStats,
  selectConnectionState,
  selectFilteredRecent,
  clearRecent,
} from '../store/transactionSlice';
import type { RootState } from '../store/transactionSlice';
import { STATUS_CONFIG, TRANSACTION_STATUSES } from '../types/transaction';
import type { TransactionStatus } from '../types/transaction';
import ConnectionBadge from '../components/ConnectionBadge';
import TransactionRow from '../components/TransactionRow';
import StatsBar from '../components/StatsBar';
import Pagination from '../components/Pagination';
import type { PagedTransactions } from '../services/TransactionHubService';


type FilterOption = 'All' | TransactionStatus;
type ViewMode     = 'live' | 'history';
const FILTERS: FilterOption[] = ['All', ...TRANSACTION_STATUSES];
const PAGE_SIZE = 50;

export default function Monitor() {
  const dispatch        = useDispatch();
  const hubService      = useTransactionHub();
  const recentAll       = useSelector(selectRecentTransactions);
  const dbStats         = useSelector(selectDbStats);
  const connectionState = useSelector(selectConnectionState);

  // Live feed filters
  const [liveFilter, setLiveFilter] = useState<FilterOption>('All');
  const [searchText, setSearchText] = useState('');

  const filteredRecent = useSelector((state: RootState) =>
    selectFilteredRecent(state, liveFilter, searchText));

  // History / pagination state (local — not in Redux, it's transient UI state)
  const [viewMode,       setViewMode]       = useState<ViewMode>('live');
  const [historyFilter,  setHistoryFilter]  = useState<FilterOption>('All');
  const [currentPage,    setCurrentPage]    = useState<PagedTransactions | null>(null);
  const [historyPage,    setHistoryPage]    = useState(1);
  const [isLoading,      setIsLoading]      = useState(false);

  const loadPage = useCallback(async (page: number, filter: FilterOption) => {
    setIsLoading(true);
    try {
      const status = filter === 'All' ? undefined : filter as TransactionStatus;
      const result = await hubService.fetchPage(page, PAGE_SIZE, status);
      setCurrentPage(result);
      setHistoryPage(page);
    } finally {
      setIsLoading(false);
    }
  }, [hubService]);

  const switchToHistory = async () => {
    setViewMode('history');
    await loadPage(1, historyFilter);
  };

  return (
    <>
      <div style={s.container}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Live Monitor</h1>
            <p style={s.subtitle}>Real-time transaction feed</p>
          </div>
          <ConnectionBadge state={connectionState} />
        </div>

        {/* Stats */}
        <div style={s.sectionLabel}>📊 Database</div>
        <StatsBar
          stats={dbStats}
          onRefresh={() => hubService.refreshStats()}
        />

        {/* View Mode Tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(viewMode === 'live' ? s.tabActive : {}) }}
            onClick={() => setViewMode('live')}>
            ⚡ Live Feed
            <span style={s.tabBadge}>{recentAll.length}</span>
          </button>
          <button style={{ ...s.tab, ...(viewMode === 'history' ? s.tabActive : {}) }}
            onClick={switchToHistory}>
            📋 Full History
            <span style={s.tabBadge}>{dbStats.total.toLocaleString()}</span>
          </button>
        </div>

        {/* ─── LIVE FEED ─── */}
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
                      ...(liveFilter === f ? s.filterBtnActive : {}),
                      ...(f !== 'All' ? { color: STATUS_CONFIG[f as TransactionStatus]?.color } : {}),
                    }}>
                    {f}
                  </button>
                ))}
              </div>
              <button style={s.clearBtn} onClick={() => dispatch(clearRecent())}
                title="Clears display only — DB is preserved">
                🗑 Clear
              </button>
            </div>

            <div style={s.countLabel}>
              Showing {filteredRecent.length} of {recentAll.length} recent
              {dbStats.total > recentAll.length && (
                <span style={{ color: '#6366f1' }}> ({dbStats.total.toLocaleString()} total in DB →
                  <button style={s.inlineBtn} onClick={switchToHistory}>view all</button>)
                </span>
              )}
            </div>

            {recentAll.length === 0 && (
              <div style={s.emptyState}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
                <p style={{ color: '#94a3b8' }}>
                  {dbStats.total > 0
                    ? `Display cleared — ${dbStats.total.toLocaleString()} transactions in DB`
                    : 'Waiting for transactions...'}
                </p>
              </div>
            )}

            <div style={s.grid}>
              {filteredRecent.map(tx => <TransactionRow key={tx.transactionId} transaction={tx} />)}
            </div>
          </>
        )}

        {/* ─── HISTORY ─── */}
        {viewMode === 'history' && (
          <>
            <div style={s.controls}>
              <div style={s.filterGroup}>
                {FILTERS.map(f => (
                  <button key={f}
                    onClick={async () => { setHistoryFilter(f); await loadPage(1, f); }}
                    style={{
                      ...s.filterBtn,
                      ...(historyFilter === f ? s.filterBtnActive : {}),
                      ...(f !== 'All' ? { color: STATUS_CONFIG[f as TransactionStatus]?.color } : {}),
                    }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {isLoading && <div style={s.loadingBanner}>⏳ Loading...</div>}

            {currentPage && !isLoading && (
              <>
                <div style={s.countLabel}>
                  Page {currentPage.page} of {currentPage.totalPages}
                  ({currentPage.totalCount.toLocaleString()} total)
                </div>
                <div style={s.grid}>
                  {currentPage.items.map(tx => <TransactionRow key={tx.transactionId} transaction={tx} />)}
                </div>
                <Pagination
                  page={currentPage.page}
                  totalPages={currentPage.totalPages}
                  hasNext={currentPage.hasNext}
                  hasPrev={currentPage.hasPrev}
                  onPage={p => loadPage(p, historyFilter)}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  container:     { maxWidth: 1000, margin: '0 auto', padding: '2rem 1rem' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  title:         { fontSize: '2rem', fontWeight: 700, color: '#f1f5f9', margin: 0 },
  subtitle:      { color: '#94a3b8', marginTop: '0.25rem' },
  sectionLabel:  { color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', marginTop: '1rem' },
  tabs:          { display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 0 },
  tab:           { padding: '0.6rem 1.2rem', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, borderBottom: '2px solid transparent', marginBottom: '-1px', display: 'flex', gap: '0.5rem', alignItems: 'center' },
  tabActive:     { color: '#f1f5f9', borderBottomColor: '#6366f1' },
  tabBadge:      { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '0.1rem 0.5rem', borderRadius: 10, fontSize: '0.75rem' },
  controls:      { display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' },
  searchInput:   { flex: 1, minWidth: 200, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.6rem 1rem', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none' },
  filterGroup:   { display: 'flex', gap: '0.5rem' },
  filterBtn:     { padding: '0.5rem 1rem', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 },
  filterBtnActive:{ background: 'rgba(255,255,255,0.1)', color: '#f1f5f9', borderColor: 'rgba(255,255,255,0.25)' },
  clearBtn:      { padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.85rem' },
  countLabel:    { color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' },
  inlineBtn:     { background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit', padding: '0 0.25rem' },
  loadingBanner: { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '0.75rem', textAlign: 'center', color: '#a5b4fc', marginBottom: '1rem' },
  emptyState:    { textAlign: 'center', padding: '4rem 2rem', color: '#475569' },
  grid:          { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
};
