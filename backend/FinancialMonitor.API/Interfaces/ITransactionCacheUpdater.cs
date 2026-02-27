using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Interfaces;

/// <summary>
/// Narrow interface for keeping the in-memory cache in sync.
///
/// Used by LocalBroadcastService (single-pod fallback) to update
/// the cache when a transaction is broadcast locally.
///
/// Note: With the Redis backplane, cross-pod cache sync is not needed —
/// each pod handles its own DB writes and cache updates independently.
/// </summary>
public interface ITransactionCacheUpdater
{
    void UpdateCache(Transaction transaction);
}
