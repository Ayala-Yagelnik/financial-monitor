using Xunit;
using FinancialMonitor.API.Models;
using FinancialMonitor.API.Services;

namespace FinancialMonitor.Tests;

/// <summary>
/// Tests for InMemoryTransactionService — fast, no DB dependencies.
/// Business logic is identical to SqliteTransactionService.
/// </summary>
public class TransactionServiceTests
{
    // ═══════════════════════════════════════
    // HAPPY PATH
    // ═══════════════════════════════════════

    [Fact]
    public async Task Upsert_NewTransaction_ReturnsIsNewTrue()
    {
        var service = new InMemoryTransactionService();
        var (isNew, error) = await service.UpsertTransactionAsync(CreateTx());
        Assert.True(isNew);
        Assert.Null(error);
    }

    [Fact]
    public async Task Upsert_NewTransaction_CanBeRetrieved()
    {
        var service = new InMemoryTransactionService();
        var tx = CreateTx();
        await service.UpsertTransactionAsync(tx);
        var all = await service.GetAllAsync();
        Assert.Single(all);
        Assert.Equal(tx.TransactionId, all[0].TransactionId);
    }

    // ═══════════════════════════════════════
    // UPSERT LOGIC
    // ═══════════════════════════════════════

    [Fact]
    public async Task Upsert_SameId_UpdatesStatus()
    {
        var service = new InMemoryTransactionService();
        var id = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;

        await service.UpsertTransactionAsync(CreateTx(id, TransactionStatus.Pending, now));
        await service.UpsertTransactionAsync(CreateTx(id, TransactionStatus.Completed, now.AddSeconds(1)));

        var all = await service.GetAllAsync();
        Assert.Single(all);
        Assert.Equal(TransactionStatus.Completed, all[0].Status);
    }

    [Fact]
    public async Task Upsert_SameId_ReturnsIsNewFalse()
    {
        var service = new InMemoryTransactionService();
        var id = Guid.NewGuid().ToString();
        await service.UpsertTransactionAsync(CreateTx(id));
        var (isNew, error) = await service.UpsertTransactionAsync(CreateTx(id));
        Assert.False(isNew);
        Assert.Null(error);
    }

    [Fact]
    public async Task Upsert_SameIdThreeTimes_OnlyOneRecord()
    {
        var service = new InMemoryTransactionService();
        var id = Guid.NewGuid().ToString();
        await service.UpsertTransactionAsync(CreateTx(id));
        await service.UpsertTransactionAsync(CreateTx(id));
        await service.UpsertTransactionAsync(CreateTx(id));
        Assert.Single(await service.GetAllAsync());
    }

    // ═══════════════════════════════════════
    // TIMESTAMP GUARD
    // ═══════════════════════════════════════

    [Fact]
    public async Task Upsert_OlderTimestamp_DoesNotOverwriteNewerStatus()
    {
        var service = new InMemoryTransactionService();
        var id = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;

        // Newer version arrives first
        await service.UpsertTransactionAsync(CreateTx(id, TransactionStatus.Completed, now));

        // Old message arrives later (out-of-order)
        await service.UpsertTransactionAsync(CreateTx(id, TransactionStatus.Pending, now.AddMinutes(-5)));

        var result = (await service.GetAllAsync()).First();
        Assert.Equal(TransactionStatus.Completed, result.Status); // Old didn't overwrite!
    }

    [Fact]
    public async Task Upsert_NewerTimestamp_DoesOverwrite()
    {
        var service = new InMemoryTransactionService();
        var id = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;

        await service.UpsertTransactionAsync(CreateTx(id, TransactionStatus.Pending, now));
        await service.UpsertTransactionAsync(CreateTx(id, TransactionStatus.Completed, now.AddMinutes(1)));

        var result = (await service.GetAllAsync()).First();
        Assert.Equal(TransactionStatus.Completed, result.Status);
    }

    // ═══════════════════════════════════════
    // SORTING & FILTERING
    // ═══════════════════════════════════════

    [Fact]
    public async Task GetAll_ReturnsSortedByDateDescending()
    {
        var service = new InMemoryTransactionService();
        var now = DateTime.UtcNow;
        var idOld    = Guid.NewGuid().ToString();
        var idRecent = Guid.NewGuid().ToString();
        var idNewest = Guid.NewGuid().ToString();

        await service.UpsertTransactionAsync(CreateTx(idOld,    timestamp: now.AddHours(-2)));
        await service.UpsertTransactionAsync(CreateTx(idNewest, timestamp: now));
        await service.UpsertTransactionAsync(CreateTx(idRecent, timestamp: now.AddHours(-1)));

        var results = await service.GetAllAsync();
        Assert.Equal(3, results.Count);
        Assert.Equal(idNewest, results[0].TransactionId);
        Assert.Equal(idRecent, results[1].TransactionId);
        Assert.Equal(idOld,    results[2].TransactionId);
    }

    [Fact]
    public async Task GetByStatus_ReturnsOnlyMatchingStatus()
    {
        var service = new InMemoryTransactionService();
        await service.UpsertTransactionAsync(CreateTx(status: TransactionStatus.Completed));
        await service.UpsertTransactionAsync(CreateTx(status: TransactionStatus.Failed));
        await service.UpsertTransactionAsync(CreateTx(status: TransactionStatus.Failed));
        await service.UpsertTransactionAsync(CreateTx(status: TransactionStatus.Pending));

        var failed = await service.GetByStatusAsync(TransactionStatus.Failed);
        Assert.Equal(2, failed.Count);
        Assert.All(failed, t => Assert.Equal(TransactionStatus.Failed, t.Status));
    }

    // ═══════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════

    [Fact]
    public async Task Upsert_InvalidGuid_ReturnsError()
    {
        var service = new InMemoryTransactionService();
        var tx = CreateTx();
        tx.TransactionId = "not-a-guid";
        var (_, error) = await service.UpsertTransactionAsync(tx);
        Assert.Contains("GUID", error!);
    }

    [Fact]
    public async Task Upsert_EmptyCurrency_ReturnsError()
    {
        var service = new InMemoryTransactionService();
        var tx = CreateTx();
        tx.Currency = "";
        var (_, error) = await service.UpsertTransactionAsync(tx);
        Assert.NotNull(error);
    }

    // ═══════════════════════════════════════
    // CONCURRENCY
    // ═══════════════════════════════════════

    [Fact]
    public async Task Upsert_100ConcurrentNewTransactions_AllSucceed()
    {
        var service = new InMemoryTransactionService();
        var tasks = Enumerable.Range(0, 100)
            .Select(_ => service.UpsertTransactionAsync(CreateTx()))
            .ToList();

        await Task.WhenAll(tasks);
        Assert.Equal(100, (await service.GetAllAsync()).Count);
    }

    [Fact]
    public async Task Upsert_50ConcurrentUpdatesToSameId_OnlyOneRecord()
    {
        var service = new InMemoryTransactionService();
        var id = Guid.NewGuid().ToString();
        var tasks = Enumerable.Range(0, 50)
            .Select(i => service.UpsertTransactionAsync(
                CreateTx(id, timestamp: DateTime.UtcNow.AddSeconds(i))))
            .ToList();

        await Task.WhenAll(tasks);
        Assert.Single(await service.GetAllAsync());
    }

    [Fact]
    public async Task GetAll_ConcurrentReadsAndWrites_NoException()
    {
        var service = new InMemoryTransactionService();
        var writes = Enumerable.Range(0, 50).Select(_ => service.UpsertTransactionAsync(CreateTx()));
        var reads  = Enumerable.Range(0, 20).Select(_ => service.GetAllAsync());
        await Task.WhenAll(writes);
        await Task.WhenAll(reads);
        Assert.True((await service.GetAllAsync()).Count > 0);
    }

    // ═══════════════════════════════════════
    // HELPER
    // ═══════════════════════════════════════

    private static Transaction CreateTx(
        string? id = null,
        TransactionStatus status = TransactionStatus.Completed,
        DateTime? timestamp = null) => new()
    {
        TransactionId = id ?? Guid.NewGuid().ToString(),
        Amount        = 1500.50m,
        Currency      = "USD",
        Status        = status,
        Timestamp     = timestamp ?? DateTime.UtcNow
    };
}
