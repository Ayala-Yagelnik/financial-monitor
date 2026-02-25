using FinancialMonitor.API.Data;
using FinancialMonitor.API.Hubs;
using FinancialMonitor.API.Messaging;
using FinancialMonitor.API.Services;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter()));

builder.Services.AddSignalR();

// ═══════════════════════════════════════════════════════
// DATABASE
// Development environment → SQLite  (local file, zero setup)
// Production environment → PostgreSQL (shared across all pods)
//
// Selection is made by DATABASE_PROVIDER environment variable
// ═══════════════════════════════════════════════════════
var dbProvider    = builder.Configuration["DATABASE_PROVIDER"] ?? "sqlite";
var pgConn        = builder.Configuration["ConnectionStrings:PostgreSQL"];
var sqliteDb      = Path.Combine(builder.Environment.ContentRootPath, "transactions.db");

builder.Services.AddDbContextFactory<AppDbContext>(options =>
{
    if (dbProvider == "postgres" && !string.IsNullOrWhiteSpace(pgConn))
    {
        options.UseNpgsql(pgConn);
        Console.WriteLine("[INFO] Database: PostgreSQL (distributed mode)");
    }
    else
    {
        options.UseSqlite($"Data Source={sqliteDb}");
        Console.WriteLine("[INFO] Database: SQLite (single-pod mode)");
    }
});

// ═══════════════════════════════════════════════════════
// REDIS — Pub/Sub for WebSocket synchronization between pods
// Without Redis → local fallback (single pod)
// ═══════════════════════════════════════════════════════
var redisConn = builder.Configuration["Redis:ConnectionString"];
var hasRedis  = false;

if (!string.IsNullOrWhiteSpace(redisConn))
{
    try
    {
        var redisCfg = ConfigurationOptions.Parse(redisConn);
        redisCfg.AbortOnConnectFail = true;
        redisCfg.ConnectTimeout     = 3000;
        redisCfg.SyncTimeout        = 3000;

        var redis = await ConnectionMultiplexer.ConnectAsync(redisCfg);
        await redis.GetDatabase().PingAsync(); // Real connection test
        builder.Services.AddSingleton<IConnectionMultiplexer>(redis);
        builder.Services.AddSingleton<ITransactionPublisher, RedisTransactionPublisher>();
        builder.Services.AddHostedService<RedisSubscriberService>();

        hasRedis = true;
        Console.WriteLine("[INFO] Redis: connected (distributed WebSocket sync)");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[WARNING] Redis unavailable: {ex.Message} → local fallback");
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

// ═══════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════
builder.Services.AddSingleton<ITransactionService, SqliteTransactionService>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(o =>
    o.AddPolicy("AllowFrontend", p =>
        p.WithOrigins("http://localhost:5173", "http://localhost:3000")
         .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

// Automatic DB creation + migrations
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("AllowFrontend");
app.UseAuthorization();
app.MapControllers();
app.MapHub<TransactionHub>("/hubs/transactions");
app.MapGet("/health", () => Results.Ok(new
{
    status   = "healthy",
    database = dbProvider,
    redis    = hasRedis
}));

app.Run();
public partial class Program { }
