# Nimbus Drive - Getting Started Guide

## Quick Start (Development)

### Prerequisites
- Docker & Docker Compose installed
- Node.js 18+ (for local development)
- Git

### 1. Clone & Setup
```bash
git clone <repository-url>
cd project-1
cp .env.example .env
```

### 2. Start Services
```bash
# Using Docker Compose
docker compose up -d

# Or using Make
make dev
```

### 3. Verify
- **API Health**: http://localhost:4173/api/health
- **MongoDB**: mongodb://localhost:27017 (user: nimbus, pass: nimbus-dev-password)

### 4. View Logs
```bash
docker compose logs -f api
```

## Project Structure

```
project-1/
├── Dockerfile              # Production-optimized multi-stage build
├── docker-compose.yml      # Development stack
├── docker-compose.prod.yml # Production stack
├── nginx.conf              # Reverse proxy configuration
├── Makefile                # Common commands
├── .env.example            # Environment template
├── .env.production         # Production config
├── package.json            # Dependencies
├── server.js               # Express API server
├── mongodb/                # Database utilities
│   └── collections.js      # Index definitions
├── docs/                   # Documentation
├── scripts/                # Utility scripts
└── README.md               # Project overview
```

## Key Commands

### Development
```bash
make dev              # Start dev environment
make dev-logs         # View logs
make dev-stop         # Stop services
make test             # Run tests
```

### Production
```bash
make prod-build       # Build image
make prod-up          # Start prod stack
make prod-logs        # View logs
make prod-down        # Stop services
```

### Docker
```bash
make build            # Build image
make ps               # List containers
make shell            # Shell into container
make clean            # Remove all containers/volumes
```

## Configuration

### Environment Variables

**Development** (`.env`):
- `PORT`: 4173
- `NODE_ENV`: development
- `MONGODB_URI`: mongodb://localhost:27017
- `JWT_SECRET`: development-secret

**Production** (`.env.production`):
- `NODE_ENV`: production
- `JWT_SECRET`: [Set to secure random value]
- `MONGODB_URI`: Use docker network: `mongodb://nimbus:password@mongo:27017`

## API Endpoints

### Health
- `GET /api/health` - Service health check

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `POST /api/auth/logout` - Sign out
- `GET /api/auth/me` - Current user

### Folders & Files
- `POST /api/folders` - Create folder
- `GET /api/folders/:id` - Get folder contents
- `PATCH /api/folders/:id` - Update folder
- `DELETE /api/folders/:id` - Delete folder

### Sharing
- `POST /api/shares` - Share resource
- `GET /api/shares/:resourceType/:resourceId` - List shares
- `DELETE /api/shares/:id` - Remove share

## Deployment

### Local Production
```bash
make prod-up
# Access at http://localhost
```

### Cloud Deployment (AWS/GCP/DigitalOcean)
1. Set environment variables on server
2. Build image: `make prod-build`
3. Push to registry: `docker tag project1-api:latest your-registry/nimbus-drive:latest`
4. Deploy: `docker stack deploy` or `kubectl apply`

## Troubleshooting

### API not starting
```bash
docker compose logs api
# Check MONGODB_URI is correct
# Verify JWT_SECRET is set
```

### MongoDB connection error
```bash
# Check mongo is healthy
docker compose ps mongo

# Verify credentials in docker-compose.yml
docker compose exec mongo mongosh -u nimbus -p nimbus-dev-password
```

### Port already in use
```bash
# Change PORT in .env or docker-compose.yml
# Or find process using port:
lsof -i :4173
kill -9 <PID>
```

## Next Steps

- Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Check [API_DOCS.md](./API_DOCS.md) for detailed endpoints
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
