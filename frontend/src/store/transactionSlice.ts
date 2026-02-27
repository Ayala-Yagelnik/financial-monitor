import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Transaction, TransactionStatus } from '../types/transaction';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DbStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  volumeByCurrency: Record<string, number>;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface TransactionState {
  /** Live feed — last 100 received via SignalR */
  recentTransactions: Transaction[];
  /** Aggregated stats from /api/transactions/stats */
  dbStats: DbStats;
  /** SignalR connection status */
  connectionState: ConnectionState;
  /** Known IDs — prevents duplicate entries in recent feed */
  knownIds: string[];
}

// ─── Initial State ────────────────────────────────────────────────────────

const EMPTY_STATS: DbStats = {
  total: 0, completed: 0, failed: 0, pending: 0, volumeByCurrency: {},
};

const RECENT_LIMIT = 100;

const initialState: TransactionState = {
  recentTransactions: [],
  dbStats: EMPTY_STATS,
  connectionState: 'connecting',
  knownIds: [],
};

// ─── Slice ────────────────────────────────────────────────────────────────

export const transactionSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    /**
     * Called by TransactionHubService when a new transaction arrives via SignalR.
     * Handles both NEW and UPDATED transactions.
     */
    receiveTransaction(state, action: PayloadAction<Transaction>) {
      const tx = action.payload;
      const isNew = !state.knownIds.includes(tx.transactionId);

      if (isNew) {
        state.knownIds.push(tx.transactionId);
        state.recentTransactions.unshift(tx);
        if (state.recentTransactions.length > RECENT_LIMIT) {
          state.recentTransactions.length = RECENT_LIMIT;
        }
        // Optimistically update stats without a server round-trip
        state.dbStats.total += 1;
        if (tx.status === 'Completed') state.dbStats.completed += 1;
        if (tx.status === 'Failed')    state.dbStats.failed    += 1;
        if (tx.status === 'Pending')   state.dbStats.pending   += 1;
        state.dbStats.volumeByCurrency[tx.currency] =
          (state.dbStats.volumeByCurrency[tx.currency] ?? 0) + tx.amount;
      } else {
        // Update existing entry in place
        const idx = state.recentTransactions.findIndex(t => t.transactionId === tx.transactionId);
        if (idx !== -1) state.recentTransactions[idx] = tx;
      }
    },

    /** Replace the live feed with freshly fetched data (e.g. after reconnect) */
    setRecentTransactions(state, action: PayloadAction<Transaction[]>) {
      state.recentTransactions = action.payload;
      state.knownIds = action.payload.map(t => t.transactionId);
    },

    /** Replace stats with server response */
    setStats(state, action: PayloadAction<DbStats>) {
      state.dbStats = action.payload;
    },

    /** Clear the visual live feed — DB data is preserved */
    clearRecent(state) {
      state.recentTransactions = [];
      state.knownIds = [];
    },

    setConnectionState(state, action: PayloadAction<ConnectionState>) {
      state.connectionState = action.payload;
    },
  },
});

export const {
  receiveTransaction,
  setRecentTransactions,
  setStats,
  clearRecent,
  setConnectionState,
} = transactionSlice.actions;

export default transactionSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────

export type RootState = { transactions: TransactionState };

export const selectRecentTransactions = (state: RootState) => state.transactions.recentTransactions;
export const selectDbStats            = (state: RootState) => state.transactions.dbStats;
export const selectConnectionState    = (state: RootState) => state.transactions.connectionState;

export const selectFilteredRecent = (
  state: RootState,
  filterStatus: TransactionStatus | 'All',
  searchText: string,
) =>
  state.transactions.recentTransactions.filter(tx => {
    const matchFilter = filterStatus === 'All' || tx.status === filterStatus;
    const matchSearch =
      !searchText ||
      tx.transactionId.toLowerCase().includes(searchText.toLowerCase()) ||
      tx.currency.toLowerCase().includes(searchText.toLowerCase());
    return matchFilter && matchSearch;
  });
