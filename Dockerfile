# ═══════════════════════════════════════════════════════
# Dockerfile - Multi-Stage Build
# 
# Why multi-stage?
# Stage 1 (build): includes all SDK (~700MB) - don't want in production
# Stage 2 (runtime): only runtime (~100MB) - small and secure
# ═══════════════════════════════════════════════════════

# ── Stage 1: BUILD ─────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy only .csproj first - leverage Docker cache
# If files didn't change, Docker won't run dotnet restore again
COPY backend/FinancialMonitor.API/FinancialMonitor.API.csproj ./FinancialMonitor.API/
RUN dotnet restore ./FinancialMonitor.API/FinancialMonitor.API.csproj

# Copy rest of code and build
COPY backend/FinancialMonitor.API/ ./FinancialMonitor.API/
RUN dotnet publish ./FinancialMonitor.API/FinancialMonitor.API.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# ── Stage 2: RUNTIME ───────────────────────────────────
# alpine = minimal Linux - much smaller image!
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime
WORKDIR /app

# Update security patches
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

# Use non-root user for security (best practice!)
# Don't run containers as root in production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy from build stage
COPY --from=build /app/publish .

# Environment settings for production
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080

EXPOSE 8080

# Health check - Kubernetes will verify container is healthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "FinancialMonitor.API.dll"]
