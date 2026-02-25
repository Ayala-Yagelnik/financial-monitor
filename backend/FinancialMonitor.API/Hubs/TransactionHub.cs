using Microsoft.AspNetCore.SignalR;

namespace FinancialMonitor.API.Hubs;

/// <summary>
/// SignalR Hub — manages WebSocket connections with clients.
/// 
/// Currently it only manages connections.
/// Broadcasting comes from RedisSubscriberService (or LocalBroadcastService).
/// </summary>
public class TransactionHub : Hub
{
    private readonly ILogger<TransactionHub> _logger;

    public TransactionHub(ILogger<TransactionHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
