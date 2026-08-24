# Production Deployment Guide

## Pre-Deployment Checklist

- [ ] Environment variables configured (`.env.production`)
- [ ] JWT_SECRET set to secure random value
- [ ] MongoDB backup strategy in place
- [ ] SSL/TLS certificates obtained
- [ ] Domain name configured
- [ ] Firewall rules configured (allow 80, 443)
- [ ] Monitoring & logging setup

## Environment Setup

### 1. Secure Variables
```bash
# Generate secure JWT secret
openssl rand -base64 32

# Set in .env.production
JWT_SECRET=<generated-value>
```

### 2. MongoDB Credentials
```bash
# Strong password for MongoDB
openssl rand -base64 24

# Update docker-compose.prod.yml
MONGO_INITDB_ROOT_PASSWORD=<secure-password>
```

### 3. SSL Certificates
```bash
mkdir -p certs

# Option A: Let's Encrypt (Certbot)
certbot certonly --standalone -d yourdomain.com

# Option B: Self-signed (dev only)
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes

# Copy to certs directory
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem certs/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem certs/key.pem
```

## Deployment Methods

### Docker Compose (Single Host)

```bash
# 1. SSH into server
ssh user@your-server.com

# 2. Clone repository
git clone <repo>
cd project-1

# 3. Create environment
cp .env.example .env.production
# Edit .env.production with production values

# 4. Build and deploy
make prod-up

# 5. Verify
curl http://localhost/api/health
```

### Docker Swarm (Multiple Hosts)

```bash
# On manager node
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml nimbus

# Check services
docker service ls
docker service logs nimbus_api
```

### Kubernetes (Production Grade)

Create `k8s-deployment.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nimbus-config
data:
  NODE_ENV: production
  PORT: "4173"

---
apiVersion: v1
kind: Secret
metadata:
  name: nimbus-secrets
type: Opaque
stringData:
  JWT_SECRET: "your-secure-secret"
  MONGODB_PASSWORD: "your-secure-password"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nimbus-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nimbus-api
  template:
    metadata:
      labels:
        app: nimbus-api
    spec:
      containers:
      - name: api
        image: your-registry/nimbus-drive:latest
        ports:
        - containerPort: 4173
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: nimbus-config
              key: NODE_ENV
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: nimbus-secrets
              key: JWT_SECRET
        livenessProbe:
          httpGet:
            path: /api/health
            port: 4173
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /api/health
            port: 4173
          initialDelaySeconds: 5
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: nimbus-api-service
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 4173
  selector:
    app: nimbus-api
```

Deploy:
```bash
kubectl apply -f k8s-deployment.yaml
kubectl get services
```

## Monitoring & Logging

### View Logs
```bash
# Docker Compose
docker compose -f docker-compose.prod.yml logs -f

# Docker Swarm
docker service logs nimbus_api -f

# Kubernetes
kubectl logs -f deployment/nimbus-api
```

### Health Checks
```bash
# API health
curl http://your-domain.com/api/health

# Database connection
docker compose -f docker-compose.prod.yml exec mongo mongosh -u nimbus -p $MONGO_PASSWORD --eval "db.adminCommand('ping')"
```

### Backup MongoDB

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/nimbus_$TIMESTAMP.dump"

mkdir -p $BACKUP_DIR

docker compose -f docker-compose.prod.yml exec -T mongo mongodump \
  -u nimbus \
  -p $MONGO_PASSWORD \
  --authenticationDatabase admin \
  --out $BACKUP_FILE

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup complete: $BACKUP_FILE"
```

Schedule with cron:
```bash
0 2 * * * /path/to/backup.sh >> /var/log/nimbus-backup.log 2>&1
```

## Security Hardening

1. **Firewall Rules**
   ```bash
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp    # HTTP
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw enable
   ```

2. **Update System**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Nginx Security Headers** (update nginx.conf)
   ```nginx
   add_header X-Content-Type-Options "nosniff";
   add_header X-Frame-Options "DENY";
   add_header X-XSS-Protection "1; mode=block";
   add_header Referrer-Policy "strict-origin-when-cross-origin";
   ```

4. **MongoDB Access**
   - Use unique credentials
   - Enable authentication
   - Restrict network access
   - Regular backups

## Performance Optimization

### Caching
- Enable CDN for static assets
- Use Redis for session cache

### Database
- Monitor indexes
- Regular VACUUM/ANALYZE
- Archive old data

### Application
- Enable gzip in nginx
- Use HTTP/2
- Implement rate limiting

## Scaling

### Horizontal Scaling
```bash
# Docker Swarm - increase replicas
docker service scale nimbus_api=5

# Kubernetes
kubectl scale deployment nimbus-api --replicas=5
```

### Vertical Scaling
Update resource limits in docker-compose.prod.yml or k8s deployment

## Maintenance

### Update Image
```bash
# Rebuild with latest code
docker build -t your-registry/nimbus-drive:v1.1.0 .
docker push your-registry/nimbus-drive:v1.1.0

# Deploy new version
docker service update --image your-registry/nimbus-drive:v1.1.0 nimbus_api
```

### Health Monitoring
```bash
# Setup alerts for failed healthchecks
# Implement monitoring with Prometheus/Grafana
```

## Rollback Plan

```bash
# Keep track of working versions
docker tag your-registry/nimbus-drive:v1.1.0 your-registry/nimbus-drive:latest-stable

# If issues occur, rollback
docker service update --image your-registry/nimbus-drive:v1.0.0 nimbus_api
```

## Support & Troubleshooting

- Check service logs: `docker compose logs -f`
- Verify MongoDB connectivity
- Check firewall rules
- Monitor disk space: `df -h`
- Monitor memory: `free -h`

For issues, check GETTING_STARTED.md troubleshooting section.
