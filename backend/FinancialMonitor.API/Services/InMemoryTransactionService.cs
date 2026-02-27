using System.Collections.Concurrent;
using FinancialMonitor.API.DTOs;
using FinancialMonitor.API.Interfaces;
using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Services;

/// <summary>
/// In-memory implementation — used exclusively in tests.
/// No DB, no EF, no DI complexity — just fast, pure logic.
/// Business logic is identical to SqliteTransactionService.
/// </summary>
public class InMemoryTransactionService : ITransactionService, ITransactionCacheUpdater
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

    public void UpdateCache(Transaction transaction) =>
        _transactions.AddOrUpdate(
            transaction.TransactionId,
            transaction,
            (_, old) => transaction.Timestamp > old.Timestamp ? transaction : old);

    public Task<(IReadOnlyList<Transaction> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize, TransactionStatus? status = null)
    {
        var query = _transactions.Values.AsEnumerable();
        if (status.HasValue) query = query.Where(t => t.Status == status.Value);
        var ordered = query.OrderByDescending(t => t.Timestamp).ToList();
        var items   = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult<(IReadOnlyList<Transaction>, int)>((items.AsReadOnly(), ordered.Count));
    }

    public Task<Transaction?> GetByIdAsync(string id) =>
        Task.FromResult(_transactions.GetValueOrDefault(id));

    public Task<TransactionStatsDto> GetStatsAsync()
    {
        var all = _transactions.Values;
        return Task.FromResult(new TransactionStatsDto(
            Total:             all.Count(),
            Completed:         all.Count(t => t.Status == TransactionStatus.Completed),
            Failed:            all.Count(t => t.Status == TransactionStatus.Failed),
            Pending:           all.Count(t => t.Status == TransactionStatus.Pending),
            VolumeByCurrency:  all.GroupBy(t => t.Currency)
                                  .ToDictionary(g => g.Key, g => g.Sum(t => t.Amount))));
    }

    public Task<IReadOnlyList<Transaction>> GetAllAsync() =>
        Task.FromResult<IReadOnlyList<Transaction>>(
            _transactions.Values.OrderByDescending(t => t.Timestamp).ToList().AsReadOnly());

    public Task<IReadOnlyList<Transaction>> GetByStatusAsync(TransactionStatus status) =>
        Task.FromResult<IReadOnlyList<Transaction>>(
            _transactions.Values.Where(t => t.Status == status)
                .OrderByDescending(t => t.Timestamp).ToList().AsReadOnly());
}
