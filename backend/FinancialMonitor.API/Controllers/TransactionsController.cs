using Microsoft.AspNetCore.Mvc;
using FinancialMonitor.API.Models;
using FinancialMonitor.API.Services;
using FinancialMonitor.API.Messaging;

namespace FinancialMonitor.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;
    private readonly ITransactionPublisher _publisher;
    private readonly ILogger<TransactionsController> _logger;

    public TransactionsController(
        ITransactionService transactionService,
        ITransactionPublisher publisher,
        ILogger<TransactionsController> logger)
    {
        _transactionService = transactionService;
        _publisher = publisher;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> UpsertTransaction([FromBody] CreateTransactionRequest request)
    {
        var transaction = request.ToTransaction();
        var (isNew, error) = await _transactionService.UpsertTransactionAsync(transaction);

        if (error != null)
            return BadRequest(new { error });

        await _publisher.PublishAsync(transaction);

        return isNew
            ? CreatedAtAction(nameof(GetTransaction), new { id = transaction.TransactionId }, transaction)
            : Ok(transaction);
    }

    /// <summary>
    /// GET api/transactions?page=1&pageSize=50&status=Failed
    /// 
    /// Returns one page of transactions with metadata about total.
    /// This prevents the browser from loading 50,000 rows at once.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] int page         = 1,
        [FromQuery] int pageSize     = 50,
        [FromQuery] TransactionStatus? status = null)
    {
        // Limit pageSize — preventing loading too much
        pageSize = Math.Clamp(pageSize, 1, 200);
        page     = Math.Max(1, page);

        var (items, totalCount) = await _transactionService.GetPagedAsync(page, pageSize, status);

        return Ok(new PagedResult<Transaction>
        {
            Items      = items,
            Page       = page,
            PageSize   = pageSize,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling((double)totalCount / pageSize),
        });
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var stats = await _transactionService.GetStatsAsync();
        return Ok(stats);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetTransaction(string id)
    {
        var tx = await _transactionService.GetByIdAsync(id);
        return tx == null
            ? NotFound(new { error = $"Transaction {id} not found" })
            : Ok(tx);
    }
}

public class PagedResult<T>
{
    public IReadOnlyList<T> Items      { get; set; } = [];
    public int Page       { get; set; }
    public int PageSize   { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages { get; set; }
    public bool HasNext   => Page < TotalPages;
    public bool HasPrev   => Page > 1;
}
