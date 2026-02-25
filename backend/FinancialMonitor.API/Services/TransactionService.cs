using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using FinancialMonitor.API.Models;
using FinancialMonitor.API.Data;

namespace FinancialMonitor.API.Services;

public class TransactionStats
{
    public int Total { get; set; }
    public int Completed { get; set; }
    public int Failed { get; set; }
    public int Pending { get; set; }
    public Dictionary<string, decimal> VolumeByCurrency { get; set; } = new();
}

public interface ITransactionService
{
    Task<(bool IsNew, string? Error)> UpsertTransactionAsync(Transaction transaction);
    Task<(IReadOnlyList<Transaction> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize, TransactionStatus? status = null);
    Task<Transaction?> GetByIdAsync(string id);
    Task<TransactionStats> GetStatsAsync();

    // For tests and Cache loading
    Task<IReadOnlyList<Transaction>> GetAllAsync();
    Task<IReadOnlyList<Transaction>> GetByStatusAsync(TransactionStatus status);
}

/// <summary>
/// SQLite/PostgreSQL implementation with in-memory cache.
///
/// Cache: Accelerates common calls (stats, recent transactions)
/// DB:    Source of truth — all data, full pagination
/// </summary>
public class SqliteTransactionService : ITransactionService
{
    private readonly IDbContextFactory<AppDbContext> _dbFactory;
    private readonly ConcurrentDictionary<string, Transaction> _cache = new();
    private bool _cacheLoaded = false;
    private readonly SemaphoreSlim _loadLock = new(1, 1);

    public SqliteTransactionService(IDbContextFactory<AppDbContext> dbFactory)
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

        // Timestamp Guard
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

    /// <summary>
    /// Pagination directly on DB — doesn't load everything to memory!
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
    /// Stats directly from DB — GROUP BY instead of loading everything
    /// </summary>
    public async Task<TransactionStats> GetStatsAsync()
    {
        await using var db = await _dbFactory.CreateDbContextAsync();

        var stats = new TransactionStats
        {
            Total     = await db.Transactions.CountAsync(),
            Completed = await db.Transactions.CountAsync(t => t.Status == TransactionStatus.Completed),
            Failed    = await db.Transactions.CountAsync(t => t.Status == TransactionStatus.Failed),
            Pending   = await db.Transactions.CountAsync(t => t.Status == TransactionStatus.Pending),
        };

        // Volume by currency — GROUP BY in SQL
        var volumes = await db.Transactions
            .GroupBy(t => t.Currency)
            .Select(g => new { Currency = g.Key, Total = g.Sum(t => t.Amount) })
            .ToListAsync();

        stats.VolumeByCurrency = volumes.ToDictionary(v => v.Currency, v => v.Total);

        return stats;
    }

    public async Task<Transaction?> GetByIdAsync(string id)
    {
        await EnsureCacheLoadedAsync();
        _cache.TryGetValue(id, out var tx);
        if (tx != null) return tx;

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
        return _cache.Values.Where(t => t.Status == status)
            .OrderByDescending(t => t.Timestamp).ToList().AsReadOnly();
    }

    private async Task EnsureCacheLoadedAsync()
    {
        if (_cacheLoaded) return;
        await _loadLock.WaitAsync();
        try
        {
            if (_cacheLoaded) return;
            await using var db = await _dbFactory.CreateDbContextAsync();
            // Load only last 2000 to cache (for performance)
            var recent = await db.Transactions
                .OrderByDescending(t => t.Timestamp)
                .Take(2000)
                .ToListAsync();
            foreach (var tx in recent)
                _cache.TryAdd(tx.TransactionId, tx);
            _cacheLoaded = true;
        }
        finally { _loadLock.Release(); }
    }
}

public class InMemoryTransactionService : ITransactionService
{
    private readonly ConcurrentDictionary<string, Transaction> _transactions = new();

    public Task<(bool IsNew, string? Error)> UpsertTransactionAsync(Transaction transaction)
    {
        if (string.IsNullOrWhiteSpace(transaction.TransactionId))
            return Task.FromResult<(bool, string?)>((false, "TransactionId is required"));
        if (!Guid.TryParse(transaction.TransactionId, out _))
            return Task.FromResult<(bool, string?)>((false, "TransactionId must be a valid GUID"));
        if (string.IsNullOrWhiteSpace(transaction.Currency))
            return Task.FromResult<(bool, string?)>((false, "Currency is required"));

        var isNew = !_transactions.ContainsKey(transaction.TransactionId);
        _transactions.AddOrUpdate(
            transaction.TransactionId,
            transaction,
            (_, old) => transaction.Timestamp > old.Timestamp ? transaction : old);

        return Task.FromResult<(bool, string?)>((isNew, null));
    }

    public Task<(IReadOnlyList<Transaction> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize, TransactionStatus? status = null)
    {
        var query = _transactions.Values.AsEnumerable();
        if (status.HasValue) query = query.Where(t => t.Status == status.Value);
        var ordered = query.OrderByDescending(t => t.Timestamp).ToList();
        var items = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult<(IReadOnlyList<Transaction>, int)>((items.AsReadOnly(), ordered.Count));
    }

    public Task<Transaction?> GetByIdAsync(string id) =>
        Task.FromResult(_transactions.GetValueOrDefault(id));

    public Task<TransactionStats> GetStatsAsync()
    {
        var all = _transactions.Values;
        return Task.FromResult(new TransactionStats
        {
            Total     = all.Count(),
            Completed = all.Count(t => t.Status == TransactionStatus.Completed),
            Failed    = all.Count(t => t.Status == TransactionStatus.Failed),
            Pending   = all.Count(t => t.Status == TransactionStatus.Pending),
            VolumeByCurrency = all.GroupBy(t => t.Currency)
                .ToDictionary(g => g.Key, g => g.Sum(t => t.Amount))
        });
    }

    public Task<IReadOnlyList<Transaction>> GetAllAsync() =>
        Task.FromResult<IReadOnlyList<Transaction>>(
            _transactions.Values.OrderByDescending(t => t.Timestamp).ToList().AsReadOnly());

    public Task<IReadOnlyList<Transaction>> GetByStatusAsync(TransactionStatus status) =>
        Task.FromResult<IReadOnlyList<Transaction>>(
            _transactions.Values.Where(t => t.Status == status)
                .OrderByDescending(t => t.Timestamp).ToList().AsReadOnly());
}
