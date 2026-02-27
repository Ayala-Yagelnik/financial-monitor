using FinancialMonitor.API.Apis;
using FinancialMonitor.API.Data;
using FinancialMonitor.API.Hubs;
using FinancialMonitor.API.Interfaces;
using FinancialMonitor.API.Messaging;
using FinancialMonitor.API.Services;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// ─── JSON ───────────────────────────────────────────────────────────────────
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter()));

// ─── DATABASE ───────────────────────────────────────────────────────────────
// Dev  → SQLite  (zero setup, file on disk)
// Prod → PostgreSQL (env var DATABASE_PROVIDER=postgres)
var dbProvider = builder.Configuration["DATABASE_PROVIDER"] ?? "sqlite";
var pgConn     = builder.Configuration["ConnectionStrings:PostgreSQL"];
var sqliteDb   = Path.Combine(builder.Environment.ContentRootPath, "transactions.db");

builder.Services.AddDbContextFactory<AppDbContext>(options =>
{
    if (dbProvider == "postgres" && !string.IsNullOrWhiteSpace(pgConn))
    {
        options.UseNpgsql(pgConn);
        Console.WriteLine("[INFO] Database: PostgreSQL");
    }
    else
    {
        options.UseSqlite($"Data Source={sqliteDb}");
        Console.WriteLine("[INFO] Database: SQLite");
    }
});

// ─── SIGNALR + REDIS BACKPLANE ───────────────────────────────────────────────
//
// The distributed problem:
//   5 pods are running. Client connects to Pod A.
//   A POST arrives at Pod B → only Pod B's SignalR clients see it.
//   Pod A's clients are blind.
//
// The solution — Redis Backplane:
//   SignalR built-in backplane support via AddStackExchangeRedis().
//   When Pod B calls hubContext.Clients.All.SendAsync(...),
//   SignalR internally publishes to a Redis channel.
//   All other pods are subscribed to that channel and re-broadcast
//   to their own connected clients automatically.
//
//   Without Redis → single-pod mode (LocalBroadcastService fallback).
//
var redisConn = builder.Configuration["Redis:ConnectionString"];
var hasRedis  = false;

var signalRBuilder = builder.Services.AddSignalR();

if (!string.IsNullOrWhiteSpace(redisConn))
{
    try
    {
        // Verify Redis is actually reachable before registering
        var redisCfg = ConfigurationOptions.Parse(redisConn);
        redisCfg.AbortOnConnectFail = true;
        redisCfg.ConnectTimeout     = 3000;

        var redis = await ConnectionMultiplexer.ConnectAsync(redisCfg);
        await redis.GetDatabase().PingAsync();

        // Register for ITransactionPublisher (still needed to trigger cache update)
        builder.Services.AddSingleton<IConnectionMultiplexer>(redis);

        // This single line replaces our entire RedisSubscriberService.
        // SignalR handles pub/sub across all pods automatically.
        signalRBuilder.AddStackExchangeRedis(redisConn, o =>
        {
            o.Configuration.AbortOnConnectFail = false;
        });

        builder.Services.AddSingleton<ITransactionPublisher, RedisTransactionPublisher>();

        hasRedis = true;
        Console.WriteLine("[INFO] Redis backplane: connected (multi-pod mode)");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[WARNING] Redis unavailable: {ex.Message} → single-pod fallback");
        builder.Services.AddSingleton<ITransactionPublisher, NoOpTransactionPublisher>();
        builder.Services.AddHostedService<LocalBroadcastService>();
    }
}
else
{
    Console.WriteLine("[INFO] Redis: not configured → single-pod mode");
    builder.Services.AddSingleton<ITransactionPublisher, NoOpTransactionPublisher>();
    builder.Services.AddHostedService<LocalBroadcastService>();
}

// ─── SERVICES ───────────────────────────────────────────────────────────────
builder.Services.AddSingleton<ITransactionService, EfTransactionService>();
builder.Services.AddSingleton<ITransactionCacheUpdater>(sp =>
    (ITransactionCacheUpdater)sp.GetRequiredService<ITransactionService>());

// ─── OPENAPI / SWAGGER ──────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ─── CORS ───────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration["CORS:AllowedOrigins"]?.Split(',') ?? 
    ["http://localhost:5173", "http://localhost:3000"];

builder.Services.AddCors(o =>
    o.AddPolicy("AllowFrontend", p =>
        p.WithOrigins(allowedOrigins)
         .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

// Auto-create DB schema on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("AllowFrontend");
app.UseAuthorization();

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────
app.MapTransactionsApi();
app.MapHub<TransactionHub>("/hubs/transactions");
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.Run();

public partial class Program { }
