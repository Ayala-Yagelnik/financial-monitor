using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.DTOs;

/// <summary>
/// DTO for creating or updating a transaction (inbound from API).
/// Using record for immutability — this is pure data transfer, not domain logic.
/// </summary>
public record CreateTransactionRequest(
    string TransactionId,
    decimal Amount,
    string Currency,
    TransactionStatus Status,
    DateTime Timestamp)
{
    public Transaction ToTransaction() => new()
    {
        TransactionId = TransactionId,
        Amount        = Amount,
        Currency      = Currency,
        Status        = Status,
        Timestamp     = Timestamp,
    };
}

/// <summary>
/// Paginated result envelope — generic, works for any list.
/// Record with init-only properties is perfect here.
/// </summary>
public record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages)
{
    public bool HasNext => Page < TotalPages;
    public bool HasPrev => Page > 1;
}

/// <summary>
/// Aggregated stats returned from /stats endpoint.
/// Record — pure output, never mutated after construction.
/// </summary>
public record TransactionStatsDto(
    int Total,
    int Completed,
    int Failed,
    int Pending,
    Dictionary<string, decimal> VolumeByCurrency);
