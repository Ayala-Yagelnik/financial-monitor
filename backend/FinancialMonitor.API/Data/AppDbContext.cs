using Microsoft.EntityFrameworkCore;
using FinancialMonitor.API.Models;

namespace FinancialMonitor.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Transaction> Transactions => Set<Transaction>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.HasKey(t => t.TransactionId);

            // Index on Timestamp — accelerates sorting
            entity.HasIndex(t => t.Timestamp);

            // Index on Status — accelerates filtering
            entity.HasIndex(t => t.Status);

            // Status saved as string (Pending/Completed/Failed)
            entity.Property(t => t.Status).HasConversion<string>();

            // Amount — full precision for finances
            entity.Property(t => t.Amount).HasColumnType("decimal(18,4)");
        });
    }
}
