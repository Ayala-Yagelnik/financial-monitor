using StackExchange.Redis;
using System.Text.Json;
using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Messaging;

public interface ITransactionPublisher
{
    Task PublishAsync(Transaction transaction);
}

/// <summary>
/// Redis Pub/Sub — for production with multiple pods.
/// Publishes to "transactions" channel that all pods listen to.
/// </summary>
public class RedisTransactionPublisher : ITransactionPublisher
{
    private readonly ISubscriber _subscriber;
    private const string Channel = "transactions";

    public RedisTransactionPublisher(IConnectionMultiplexer redis)
    {
        _subscriber = redis.GetSubscriber();
    }

    public async Task PublishAsync(Transaction transaction)
    {
        var json = JsonSerializer.Serialize(transaction);
        await _subscriber.PublishAsync(RedisChannel.Literal(Channel), json);
    }
}

/// <summary>
/// Local fallback — when no Redis (single pod only).
/// Writes to internal Channel that LocalBroadcastService listens to.
/// </summary>
public class NoOpTransactionPublisher : ITransactionPublisher
{
    public async Task PublishAsync(Transaction transaction)
    {
        await LocalBroadcastService.BroadcastChannel.Writer.WriteAsync(transaction);
    }
}
