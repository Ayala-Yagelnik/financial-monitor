using StackExchange.Redis;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;
using FinancialMonitor.API.Models;
using FinancialMonitor.API.Hubs;
using FinancialMonitor.API.Services;

namespace FinancialMonitor.API.Messaging;

/// <summary>
/// Listens to Redis channel and broadcasts to SignalR.
/// Runs only when there's real Redis — Program.cs verifies this before registration.
/// </summary>
public class RedisSubscriberService : BackgroundService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly IHubContext<TransactionHub> _hubContext;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RedisSubscriberService> _logger;
    private const string Channel = "transactions";

    public RedisSubscriberService(
        IConnectionMultiplexer redis,
        IHubContext<TransactionHub> hubContext,
        IServiceScopeFactory scopeFactory,
        ILogger<RedisSubscriberService> logger)
    {
        _redis = redis;
        _hubContext = hubContext;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var subscriber = _redis.GetSubscriber();

                await subscriber.SubscribeAsync(
                    RedisChannel.Literal(Channel),
                    async (_, message) =>
                    {
                        try
                        {
                            var transaction = JsonSerializer.Deserialize<Transaction>(message!);
                            if (transaction == null) return;

                            // Update local cache
                            using var scope = _scopeFactory.CreateScope();
                            var service = scope.ServiceProvider.GetRequiredService<ITransactionService>();
                            await service.UpsertTransactionAsync(transaction);

                            // Broadcast to WebSocket clients
                            await _hubContext.Clients.All.SendAsync(
                                "ReceiveTransaction", transaction, stoppingToken);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error processing Redis message");
                        }
                    });

                _logger.LogInformation("Redis subscriber active on channel '{Channel}'", Channel);

                // Wait until cancellation
                await Task.Delay(Timeout.Infinite, stoppingToken);
                await subscriber.UnsubscribeAsync(RedisChannel.Literal(Channel));
                break;
            }
            catch (OperationCanceledException)
            {
                break; // Normal shutdown
            }
            catch (Exception ex)
            {
                // Redis crashed mid-operation — retry after 5 seconds
                _logger.LogWarning(ex, "Redis subscription lost. Retrying in 5s...");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }
}
