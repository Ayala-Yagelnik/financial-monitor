using Microsoft.AspNetCore.SignalR;
using FinancialMonitor.API.Hubs;
using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Messaging;

/// <summary>
/// Fallback when no Redis — single pod only.
/// 
/// Because the NoOpPublisher doesn't do anything,
/// we need another mechanism to broadcast to SignalR.
/// 
/// Using internal Channel:
/// Controller → Channel → LocalBroadcastService → SignalR
/// </summary>
public class LocalBroadcastService : BackgroundService
{
    private readonly IHubContext<TransactionHub> _hubContext;
    private readonly ILogger<LocalBroadcastService> _logger;

    // Channel = internal thread-safe async queue
    // Like Redis but inside the same process
    public static readonly System.Threading.Channels.Channel<Transaction> BroadcastChannel =
        System.Threading.Channels.Channel.CreateUnbounded<Transaction>();

    public LocalBroadcastService(
        IHubContext<TransactionHub> hubContext,
        ILogger<LocalBroadcastService> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var transaction in BroadcastChannel.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("ReceiveTransaction", transaction, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error broadcasting transaction locally");
            }
        }
    }
}
