using System.Text.Json.Serialization;

namespace FinancialMonitor.API.Models;

/// <summary>
/// Transaction status enum — three possible states.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TransactionStatus
{
    Pending,
    Completed,
    Failed
}

/// <summary>
/// The central domain entity.
/// NOTE: We keep this as a class (not record) because EF Core
/// tracks entities by reference and uses change-tracking internally.
/// Records with value semantics can cause subtle EF bugs.
/// </summary>
public class Transaction
{
    /// <summary>Unique identifier — must be a valid GUID</summary>
    public required string TransactionId { get; set; }

    /// <summary>Transaction amount — must be positive</summary>
    public decimal Amount { get; set; }

    /// <summary>Currency code (USD, EUR, ILS, etc.)</summary>
    public required string Currency { get; set; }

    /// <summary>Current status of the transaction</summary>
    public TransactionStatus Status { get; set; }

    /// <summary>Transaction time — ISO 8601</summary>
    public DateTime Timestamp { get; set; }
}
