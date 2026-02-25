import { useEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import type { Transaction, TransactionStatus } from '../types/transaction';

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface DbStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  volumeByCurrency: Record<string, number>;
}

export interface PagedTransactions {
  items: Transaction[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface UseTransactionHubResult {
  recentTransactions: Transaction[];
  connectionState: ConnectionState;
  clearRecent: () => void;
  dbStats: DbStats;
  refreshStats: () => Promise<void>;
  fetchPage: (page: number, pageSize?: number, status?: TransactionStatus) => Promise<PagedTransactions>;
}

const HUB_URL    = '/hubs/transactions';
const API_URL    = '/api/transactions';
const STATS_URL  = '/api/transactions/stats';
const RECENT_LIMIT = 100;

const EMPTY_STATS: DbStats = {
  total: 0, completed: 0, failed: 0, pending: 0, volumeByCurrency: {}
};

export function useTransactionHub(): UseTransactionHubResult {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [connectionState, setConnectionState]       = useState<ConnectionState>('connecting');
  const [dbStats, setDbStats]                       = useState<DbStats>(EMPTY_STATS);
  const knownIds = useRef<Set<string>>(new Set());

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch(STATS_URL);
      if (!res.ok) {
        // Old backend that doesn't know /stats — calculate from transactions
        console.warn('Stats endpoint not available, computing locally');
        return;
      }
      const data = await res.json();
      // normalize — backend can return camelCase or PascalCase
      setDbStats({
        total:             data.total             ?? data.Total             ?? 0,
        completed:         data.completed         ?? data.Completed         ?? 0,
        failed:            data.failed            ?? data.Failed            ?? 0,
        pending:           data.pending           ?? data.Pending           ?? 0,
        volumeByCurrency:  data.volumeByCurrency  ?? data.VolumeByCurrency  ?? {},
      });
    } catch (err) {
      console.warn('Failed to load stats:', err);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}?page=1&pageSize=${RECENT_LIMIT}`);
      if (!res.ok) return;
      const data = await res.json();

      // Old backend returns array directly, new returns { items, totalCount, ... }
      const items: Transaction[] = Array.isArray(data)
        ? data
        : (data.items ?? data.Items ?? []);

      setRecentTransactions(items);
      knownIds.current = new Set(items.map((t: Transaction) => t.transactionId));
    } catch (err) {
      console.warn('Failed to load recent:', err);
    }
  }, []);

  const fetchPage = useCallback(async (
    page: number,
    pageSize = 50,
    status?: TransactionStatus
  ): Promise<PagedTransactions> => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(status ? { status } : {})
    });
    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) throw new Error('Failed to fetch page');
    const data = await res.json();

    // normalize — supports both formats
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
  }, []);

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connection.on('ReceiveTransaction', (tx: Transaction) => {
      // normalize field names (camelCase vs PascalCase)
      const normalized: Transaction = {
        transactionId: tx.transactionId ?? (tx as any).TransactionId,
        amount:        tx.amount        ?? (tx as any).Amount,
        currency:      tx.currency      ?? (tx as any).Currency,
        status:        tx.status        ?? (tx as any).Status,
        timestamp:     tx.timestamp     ?? (tx as any).Timestamp,
      };

      const isNew = !knownIds.current.has(normalized.transactionId);

      if (isNew) {
        knownIds.current.add(normalized.transactionId);
        setRecentTransactions(prev => {
          const updated = [normalized, ...prev];
          return updated.length > RECENT_LIMIT ? updated.slice(0, RECENT_LIMIT) : updated;
        });
        setDbStats(prev => ({
          ...prev,
          total:     prev.total + 1,
          completed: normalized.status === 'Completed' ? prev.completed + 1 : prev.completed,
          failed:    normalized.status === 'Failed'    ? prev.failed    + 1 : prev.failed,
          pending:   normalized.status === 'Pending'   ? prev.pending   + 1 : prev.pending,
          volumeByCurrency: {
            ...prev.volumeByCurrency,
            [normalized.currency]: (prev.volumeByCurrency[normalized.currency] ?? 0) + normalized.amount,
          }
        }));
      } else {
        setRecentTransactions(prev =>
          prev.map(t => t.transactionId === normalized.transactionId ? normalized : t)
        );
      }
    });

    connection.onreconnecting(() => setConnectionState('connecting'));
    connection.onreconnected(async () => {
      setConnectionState('connected');
      await Promise.all([loadRecent(), refreshStats()]);
    });
    connection.onclose(() => setConnectionState('disconnected'));

    connection.start()
      .then(async () => {
        setConnectionState('connected');
        await Promise.all([loadRecent(), refreshStats()]);
      })
      .catch(err => {
        console.error('SignalR connection failed:', err);
        setConnectionState('error');
        // Even without WebSocket — load data from API
        loadRecent();
        refreshStats();
      });

    return () => { connection.stop(); };
  }, [loadRecent, refreshStats]);

  const clearRecent = useCallback(() => {
    setRecentTransactions([]);
    // dbStats remains!
  }, []);

  return { recentTransactions, connectionState, clearRecent, dbStats, refreshStats, fetchPage };
}
