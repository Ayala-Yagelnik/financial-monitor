import * as signalR from '@microsoft/signalr';
import type { AppDispatch } from '../store';
import {
  receiveTransaction,
  setRecentTransactions,
  setStats,
  setConnectionState,
  type DbStats,
} from '../store/transactionSlice';
import type { Transaction, TransactionStatus } from '../types/transaction';

// ─── Config ────────────────────────────────────────────────────────────────

const HUB_URL       = '/hubs/transactions';
const API_URL       = '/api/transactions';
const STATS_URL     = '/api/transactions/stats';
const RECENT_LIMIT  = 100;

// ─── Types ────────────────────────────────────────────────────────────────

export interface PagedTransactions {
  items:      Transaction[];
  page:       number;
  pageSize:   number;
  totalCount: number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────

/**
 * TransactionHubService:
 *   - Owns the SignalR HubConnection lifecycle (connect / reconnect / disconnect)
 *   - Owns all HTTP calls to /api/transactions
 *   - Dispatches Redux actions — components never touch the network directly
 *
 * This separation means:
 *   - Components are pure UI (read from store, dispatch actions)
 *   - The Hub is NOT the state manager — Redux is
 *   - Easy to test (mock the service, not SignalR)
 */
export class TransactionHubService {
  private connection: signalR.HubConnection | null = null;
  private dispatch: AppDispatch;

  constructor(dispatch: AppDispatch) {
    this.dispatch = dispatch;
  }

  /** Start the SignalR connection and load initial data. */
  async start(): Promise<void> {
    this.dispatch(setConnectionState('connecting'));

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.connection.on('ReceiveTransaction', (tx: Transaction) => {
      this.dispatch(receiveTransaction(this.normalize(tx)));
    });

    this.connection.onreconnecting(() =>
      this.dispatch(setConnectionState('connecting')));

    this.connection.onreconnected(async () => {
      this.dispatch(setConnectionState('connected'));
      await this.loadInitialData();
    });

    this.connection.onclose(() =>
      this.dispatch(setConnectionState('disconnected')));

    try {
      await this.connection.start();
      this.dispatch(setConnectionState('connected'));
      await this.loadInitialData();
    } catch (err) {
      console.error('SignalR connection failed:', err);
      this.dispatch(setConnectionState('error'));
      // Even without WebSocket — load data from REST
      await this.loadInitialData();
    }
  }

  /** Stop the connection (called on component unmount). */
  async stop(): Promise<void> {
    await this.connection?.stop();
  }

  // ─── HTTP Methods ──────────────────────────────────────────────────────

  /** Fetch a paginated page and return it (does NOT update Redux — caller decides). */
  async fetchPage(
    page: number,
    pageSize = 50,
    status?: TransactionStatus,
  ): Promise<PagedTransactions> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(status ? { status } : {}),
    });
    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) throw new Error('Failed to fetch page');
    const data = await res.json();

    if (Array.isArray(data)) {
      return {
        items: data, page: 1, pageSize: data.length,
        totalCount: data.length, totalPages: 1,
        hasNext: false, hasPrev: false,
      };
    }
    return {
      items:      data.items      ?? data.Items      ?? [],
      page:       data.page       ?? data.Page       ?? page,
      pageSize:   data.pageSize   ?? data.PageSize   ?? pageSize,
      totalCount: data.totalCount ?? data.TotalCount ?? 0,
      totalPages: data.totalPages ?? data.TotalPages ?? 1,
      hasNext:    data.hasNext    ?? data.HasNext    ?? false,
      hasPrev:    data.hasPrev    ?? data.HasPrev    ?? false,
    };
  }

  /** Refresh stats from server and update Redux. */
  async refreshStats(): Promise<void> {
    try {
      const res = await fetch(STATS_URL);
      if (!res.ok) return;
      const data = await res.json();
      const stats: DbStats = {
        total:            data.total            ?? data.Total            ?? 0,
        completed:        data.completed        ?? data.Completed        ?? 0,
        failed:           data.failed           ?? data.Failed           ?? 0,
        pending:          data.pending          ?? data.Pending          ?? 0,
        volumeByCurrency: data.volumeByCurrency ?? data.VolumeByCurrency ?? {},
      };
      this.dispatch(setStats(stats));
    } catch (err) {
      console.warn('Failed to load stats:', err);
    }
  }

  /** Send a single transaction to the API. */
  async sendTransaction(tx: Transaction): Promise<boolean> {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async loadInitialData(): Promise<void> {
    const [page] = await Promise.allSettled([
      this.fetchPage(1, RECENT_LIMIT),
      this.refreshStats(),
    ]);
    if (page.status === 'fulfilled') {
      this.dispatch(setRecentTransactions(page.value.items));
    }
  }

  /** Normalize camelCase vs PascalCase from backend. */
  private normalize(tx: Transaction): Transaction {
    return {
      transactionId: tx.transactionId ?? (tx as never as Record<string, string>)['TransactionId'],
      amount:        tx.amount        ?? (tx as never as Record<string, number>)['Amount'],
      currency:      tx.currency      ?? (tx as never as Record<string, string>)['Currency'],
      status:        tx.status        ?? (tx as never as Record<string, string>)['Status'] as Transaction['status'],
      timestamp:     tx.timestamp     ?? (tx as never as Record<string, string>)['Timestamp'],
    };
  }
}
