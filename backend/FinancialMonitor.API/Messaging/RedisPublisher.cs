using Microsoft.AspNetCore.SignalR;
using FinancialMonitor.API.Hubs;
using FinancialMonitor.API.Interfaces;
using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Messaging;

/// <summary>
/// Production publisher — uses SignalR's built-in Redis backplane.
///
/// hubContext.Clients.All.SendAsync(...) looks like a local call,
/// but with AddStackExchangeRedis() registered, SignalR internally
/// publishes to Redis so ALL pods receive and forward the message.
///
/// No manual Pub/Sub code needed — SignalR handles it entirely.
/// </summary>
public class RedisTransactionPublisher : ITransactionPublisher
{
    private readonly IHubContext<TransactionHub> _hubContext;

    public RedisTransactionPublisher(IHubContext<TransactionHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task PublishAsync(Transaction transaction)
    {
        await _hubContext.Clients.All.SendAsync("ReceiveTransaction", transaction);
    }
}

/// <summary>
/// Single-pod fallback — no Redis.
/// Writes to an internal Channel that LocalBroadcastService reads.
/// </summary>
public class NoOpTransactionPublisher : ITransactionPublisher
{
    public async Task PublishAsync(Transaction transaction)
    {
        await LocalBroadcastService.BroadcastChannel.Writer.WriteAsync(transaction);
    }
}
