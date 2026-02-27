using FinancialMonitor.API.DTOs;
using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Interfaces;

/// <summary>
/// Core service contract for transaction operations.
/// All implementations (SQLite, InMemory for tests) must fulfill this contract.
/// </summary>
public interface ITransactionService
{
    Task<(bool IsNew, string? Error)> UpsertTransactionAsync(Transaction transaction);

    Task<(IReadOnlyList<Transaction> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize, TransactionStatus? status = null);

    Task<Transaction?> GetByIdAsync(string id);

    Task<TransactionStatsDto> GetStatsAsync();

    // Used by tests and initial cache load
    Task<IReadOnlyList<Transaction>> GetAllAsync();
    Task<IReadOnlyList<Transaction>> GetByStatusAsync(TransactionStatus status);
}
