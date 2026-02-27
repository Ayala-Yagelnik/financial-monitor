using FinancialMonitor.API.DTOs;
using FinancialMonitor.API.Interfaces;
using FinancialMonitor.API.Models;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Builder;

namespace FinancialMonitor.API.Apis;

/// <summary>
/// Minimal API endpoint registration — replaces TransactionsController.
/// Pattern inspired by eShop: static class with extension method.
/// 
/// Benefits over classic controllers:
///   - Strongly typed return types (Results<T1,T2>) → OpenAPI schema is accurate
///   - Less boilerplate (no [ApiController], no ControllerBase)
///   - Better performance (no MVC middleware overhead)
///   - Easier to test (plain functions)
/// </summary>
public static class TransactionsApi
{
    public static IEndpointRouteBuilder MapTransactionsApi(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/transactions")
            .WithTags("Transactions")
            .WithOpenApi();

        group.MapPost("/",    UpsertTransaction);
        group.MapGet("/",     GetTransactions);
        group.MapGet("/stats", GetStats);
        group.MapGet("/{id}", GetTransaction);

        return app;
    }

    // ─── Handlers ───────────────────────────────────────────────────────────

    /// <summary>POST /api/transactions — create or update a transaction</summary>
    private static async Task<Results<Created<Transaction>, Ok<Transaction>, BadRequest<object>>>
        UpsertTransaction(
            CreateTransactionRequest request,
            ITransactionService transactionService,
            ITransactionPublisher publisher)
    {
        var transaction = request.ToTransaction();
        var (isNew, error) = await transactionService.UpsertTransactionAsync(transaction);

        if (error != null)
            return TypedResults.BadRequest<object>(new { error });

        await publisher.PublishAsync(transaction);

        return isNew
            ? TypedResults.Created($"/api/transactions/{transaction.TransactionId}", transaction)
            : TypedResults.Ok(transaction);
    }

    /// <summary>GET /api/transactions?page=1&amp;pageSize=50&amp;status=Failed</summary>
    private static async Task<Ok<PagedResult<Transaction>>> GetTransactions(
        ITransactionService transactionService,
        int page      = 1,
        int pageSize  = 50,
        TransactionStatus? status = null)
    {
        pageSize = Math.Clamp(pageSize, 1, 200);
        page     = Math.Max(1, page);

        var (items, totalCount) = await transactionService.GetPagedAsync(page, pageSize, status);

        var result = new PagedResult<Transaction>(
            Items:      items,
            Page:       page,
            PageSize:   pageSize,
            TotalCount: totalCount,
            TotalPages: (int)Math.Ceiling((double)totalCount / pageSize));

        return TypedResults.Ok(result);
    }

    /// <summary>GET /api/transactions/stats</summary>
    private static async Task<Ok<TransactionStatsDto>> GetStats(
        ITransactionService transactionService)
    {
        var stats = await transactionService.GetStatsAsync();
        return TypedResults.Ok(stats);
    }

    /// <summary>GET /api/transactions/{id}</summary>
    private static async Task<Results<Ok<Transaction>, NotFound<object>>> GetTransaction(
        string id,
        ITransactionService transactionService)
    {
        var tx = await transactionService.GetByIdAsync(id);
        return tx is not null
            ? TypedResults.Ok(tx)
            : TypedResults.NotFound<object>(new { error = $"Transaction {id} not found" });
    }
}
