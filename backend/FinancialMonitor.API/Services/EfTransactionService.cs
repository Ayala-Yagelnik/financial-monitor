using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using FinancialMonitor.API.Data;
using FinancialMonitor.API.DTOs;
using FinancialMonitor.API.Interfaces;
using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Services;

/// <summary>
/// SQLite/PostgreSQL implementation with in-memory cache.
///
/// Cache: Accelerates common calls (stats, recent transactions, GetById)
/// DB:    Source of truth — all data, full pagination
///
/// Implements both ITransactionService and ITransactionCacheUpdater.
/// The cache updater interface is kept narrow so Redis subscriber
/// doesn't need to know about the full service.
/// </summary>
public class EfTransactionService : ITransactionService, ITransactionCacheUpdater
{
    private readonly IDbContextFactory<AppDbContext> _dbFactory;
    private readonly ConcurrentDictionary<string, Transaction> _cache = new();
    private volatile bool _cacheLoaded;
    private readonly SemaphoreSlim _loadLock = new(1, 1);

    public EfTransactionService(IDbContextFactory<AppDbContext> dbFactory)
    {
        _dbFactory = dbFactory;
    }

    public async Task<(bool IsNew, string? Error)> UpsertTransactionAsync(Transaction transaction)
    {
        if (string.IsNullOrWhiteSpace(transaction.TransactionId))
            return (false, "TransactionId is required");
        if (!Guid.TryParse(transaction.TransactionId, out _))
            return (false, "TransactionId must be a valid GUID");
        if (string.IsNullOrWhiteSpace(transaction.Currency))
            return (false, "Currency is required");

        await EnsureCacheLoadedAsync();

        // Timestamp guard — ignore stale/out-of-order messages
        if (_cache.TryGetValue(transaction.TransactionId, out var existing)
            && transaction.Timestamp <= existing.Timestamp)
            return (false, null);

        var isNew = !_cache.ContainsKey(transaction.TransactionId);

        await using var db = await _dbFactory.CreateDbContextAsync();
        if (isNew)
        {
            db.Transactions.Add(transaction);
            await db.SaveChangesAsync();
        }
        else
        {
            await db.Transactions
                .Where(t => t.TransactionId == transaction.TransactionId
                         && t.Timestamp < transaction.Timestamp)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(t => t.Status,    transaction.Status)
                    .SetProperty(t => t.Amount,    transaction.Amount)
                    .SetProperty(t => t.Currency,  transaction.Currency)
                    .SetProperty(t => t.Timestamp, transaction.Timestamp));
        }

        _cache.AddOrUpdate(
            transaction.TransactionId,
            transaction,
            (_, old) => transaction.Timestamp > old.Timestamp ? transaction : old);

        return (isNew, null);
    }

    public void UpdateCache(Transaction transaction) =>
        _cache.AddOrUpdate(
            transaction.TransactionId,
            transaction,
            (_, old) => transaction.Timestamp > old.Timestamp ? transaction : old);

    /// <summary>
    /// Pagination directly on DB — doesn't load everything into memory.
    /// </summary>
    public async Task<(IReadOnlyList<Transaction> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize, TransactionStatus? status = null)
    {
        await using var db = await _dbFactory.CreateDbContextAsync();

        var query = db.Transactions.AsNoTracking();
        if (status.HasValue)
            query = query.Where(t => t.Status == status.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(t => t.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items.AsReadOnly(), totalCount);
    }

    /// <summary>
    /// Stats via GROUP BY in SQL — not loading everything into memory.
    /// </summary>
    public async Task<TransactionStatsDto> GetStatsAsync()
    {
        await using var db = await _dbFactory.CreateDbContextAsync();

        var total     = await db.Transactions.CountAsync();
        var completed = await db.Transactions.CountAsync(t => t.Status == TransactionStatus.Completed);
        var failed    = await db.Transactions.CountAsync(t => t.Status == TransactionStatus.Failed);
        var pending   = await db.Transactions.CountAsync(t => t.Status == TransactionStatus.Pending);

        var volumes = await db.Transactions
            .GroupBy(t => t.Currency)
            .Select(g => new { Currency = g.Key, Total = g.Sum(t => t.Amount) })
            .ToListAsync();

        return new TransactionStatsDto(
            Total:              total,
            Completed:          completed,
            Failed:             failed,
            Pending:            pending,
            VolumeByCurrency:   volumes.ToDictionary(v => v.Currency, v => v.Total));
    }

    public async Task<Transaction?> GetByIdAsync(string id)
    {
        await EnsureCacheLoadedAsync();
        if (_cache.TryGetValue(id, out var tx)) return tx;

        await using var db = await _dbFactory.CreateDbContextAsync();
        return await db.Transactions.FindAsync(id);
    }

    public async Task<IReadOnlyList<Transaction>> GetAllAsync()
    {
        await EnsureCacheLoadedAsync();
        return _cache.Values.OrderByDescending(t => t.Timestamp).ToList().AsReadOnly();
    }

    public async Task<IReadOnlyList<Transaction>> GetByStatusAsync(TransactionStatus status)
    {
        await EnsureCacheLoadedAsync();
        return _cache.Values
            .Where(t => t.Status == status)
            .OrderByDescending(t => t.Timestamp)
            .ToList()
            .AsReadOnly();
    }

    private async Task EnsureCacheLoadedAsync()
    {
        if (_cacheLoaded) return;
        await _loadLock.WaitAsync();
        try
        {
            if (_cacheLoaded) return;
            await using var db = await _dbFactory.CreateDbContextAsync();
            // Load only last 2000 to keep memory bounded
            var recent = await db.Transactions
                .OrderByDescending(t => t.Timestamp)
                .Take(2000)
                .ToListAsync();
            foreach (var t in recent)
                _cache.TryAdd(t.TransactionId, t);
            _cacheLoaded = true;
        }
        finally { _loadLock.Release(); }
    }
}
