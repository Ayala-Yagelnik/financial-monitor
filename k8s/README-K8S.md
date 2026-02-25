# 🚀 Deploy to Kubernetes

## Prerequisites
- Docker Desktop with Kubernetes enabled
- kubectl installed

## Deployment

```bash
# 1. Build image
cd financial-monitor
docker build -t financial-monitor:latest .

# 2. Deploy in correct order
kubectl apply -f k8s/secrets.yaml     # secrets first
kubectl apply -f k8s/postgres.yaml    # DB
kubectl apply -f k8s/redis.yaml       # Pub/Sub
kubectl apply -f k8s/appsettings.yaml # Config

# Wait until PostgreSQL is Ready for the application
kubectl wait --for=condition=ready pod -l app=postgres --timeout=60s

kubectl apply -f k8s/deployment.yaml  # application (3 pods)
kubectl apply -f k8s/service.yaml     # LoadBalancer

# 3. Test setup
kubectl get pods
# Expected to see:
# financial-monitor-xxx   Running  (x3)
# postgres-0              Running  (x1)
# redis-xxx               Running  (x1)
```

## Testing sync between pods

```bash
# Get all pods
kubectl get pods -l app=financial-monitor

# Port-forward to pod 1 and pod 2
kubectl port-forward pod/<POD-1-NAME> 5001:8080 &
kubectl port-forward pod/<POD-2-NAME> 5002:8080 &

# Send request to pod 1
curl -X POST http://localhost:5001/api/transactions \
  -H "Content-Type: application/json" \
  -d "{\n    \"transactionId\": \"$(uuidgen)\",\n    \"amount\": 1234.56,\n    \"currency\": \"USD\",\n    \"status\": \"Completed\",\n    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"\n  }"

# Check that pod 2 sees the update from DB!
curl http://localhost:5002/api/transactions
```

## How it works

```
Client → POST → Pod 1
                  ↓
            PostgreSQL (shared by all) ✅
                  ↓
            Redis Pub/Sub
           /     |      \
        Pod 1  Pod 2  Pod 3
          ↓      ↓      ↓
       SignalR SignalR SignalR
          ↓      ↓      ↓
       Clients Clients Clients ✅
```

## Cleanup production

```bash
# Delete all data from DB (for testing only!)
kubectl exec -it postgres-0 -- psql -U monitor -d financialmonitor \
  -c "TRUNCATE TABLE \"Transactions\";"
```

## Delete all

```bash
kubectl delete -f k8s/
```
