using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Interfaces;

/// <summary>
/// Publishing contract — abstracts Redis vs local fallback.
/// The controller depends on this interface, not on a specific implementation.
/// </summary>
public interface ITransactionPublisher
{
    Task PublishAsync(Transaction transaction);
}
