using System.Text.Json.Serialization;

namespace FinancialMonitor.API.Models;

/// <summary>
/// Enum for transaction status - three possible states
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TransactionStatus
{
    Pending,
    Completed,
    Failed
}

/// <summary>
/// The central model of the system.
/// Every transaction entering the API must be in this format.
/// </summary>
public class Transaction
{
    /// <summary>
    /// Unique identifier - must be a valid GUID
    /// </summary>
    public required string TransactionId { get; set; }

    /// <summary>
    /// Transaction amount - must be positive
    /// </summary>
    public decimal Amount { get; set; }

    /// <summary>
    /// Currency code (USD, EUR, ILS etc.)
    /// </summary>
    public required string Currency { get; set; }

    /// <summary>
    /// Current status of the transaction
    /// </summary>
    public TransactionStatus Status { get; set; }

    /// <summary>
    /// Transaction time - ISO 8601 format
    /// </summary>
    public DateTime Timestamp { get; set; }
}

/// <summary>
/// DTO for receiving transaction from API (with validation annotations)
/// </summary>
public class CreateTransactionRequest
{
    public required string TransactionId { get; set; }
    public decimal Amount { get; set; }
    public required string Currency { get; set; }
    public TransactionStatus Status { get; set; }
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// Converts the request to the internal model
    /// </summary>
    public Transaction ToTransaction() => new()
    {
        TransactionId = TransactionId,
        Amount = Amount,
        Currency = Currency,
        Status = Status,
        Timestamp = Timestamp
    };
}
