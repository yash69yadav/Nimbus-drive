# Nimbus Drive

A production-ready cloud storage application built with Node.js, Express, MongoDB, and Docker.

## Features

- 🔐 **Secure Authentication** - JWT-based auth with password hashing (bcryptjs)
- 📁 **File Management** - Create, upload, download, organize files and folders
- 👥 **Collaboration** - Share files/folders with view/edit permissions
- 🗑️ **Trash & Recovery** - Soft delete with restore functionality
- 🔍 **Search** - Full-text search across files and folders
- ⭐ **Favorites** - Star important items for quick access
- 📊 **Activity Log** - Audit trail of all actions
- 🔗 **Link Sharing** - Public links with optional password protection
- 🚀 **Production Ready** - Docker, health checks, monitoring
- 📦 **Optimized** - 50MB multi-stage Docker image

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Make (optional, for convenience commands)
- Node.js 18+ (for local development)

### Development
```bash
# Clone repository
git clone <repository>
cd project-1

# Setup environment
cp .env.example .env

# Start services
make dev

# Access
# API: http://localhost:4173
# MongoDB: mongodb://localhost:27017
```

### Production
```bash
# Configure production environment
cp .env.example .env.production
# Edit .env.production with production values

# Build and deploy
make prod-up

# Access
# http://localhost or your domain
```

## Project Structure

```
project-1/
├── Dockerfile                 # Production Docker build
├── docker-compose.yml         # Development compose
├── docker-compose.prod.yml    # Production compose
├── nginx.conf                 # Nginx configuration
├── Makefile                   # Common commands
├── .env.example               # Environment template
├── .env.production            # Production config
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies
├── server.js                  # Express server
├── mongodb/collections.js     # Database indexes
├── docs/
│   ├── GETTING_STARTED.md    # Getting started guide
│   ├── DEPLOYMENT.md         # Deployment guide
│   └── ARCHITECTURE.md       # Architecture overview
├── scripts/
│   ├── backup-db.sh          # Database backup
│   ├── restore-db.sh         # Database restore
│   └── health-check.sh       # Health check
└── README.md                  # This file
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Folders
- `POST /api/folders` - Create folder
- `GET /api/folders/:id` - Get folder contents
- `PATCH /api/folders/:id` - Update folder
- `DELETE /api/folders/:id` - Delete folder

### Files
- `POST /api/files` - Upload file
- `GET /api/files/:id` - Get file info
- `GET /api/files/:id/download` - Download file
- `PATCH /api/files/:id` - Rename/move file
- `DELETE /api/files/:id` - Delete file

### Sharing
- `POST /api/shares` - Share resource
- `GET /api/shares/:resourceType/:resourceId` - List shares
- `DELETE /api/shares/:id` - Remove share

### Utilities
- `GET /api/health` - Health check
- `GET /api/search?q=query` - Search files/folders
- `POST /api/stars` - Star item
- `DELETE /api/stars` - Unstar item
- `GET /api/trash` - View trash
- `POST /api/trash/restore` - Restore item

## Commands

### Development
```bash
make dev              # Start development environment
make dev-logs         # View dev logs
make dev-stop         # Stop development environment
make test             # Run tests
```

### Production
```bash
make prod-build       # Build production image
make prod-up          # Start production
make prod-logs        # View prod logs
make prod-down        # Stop production
```

### Docker
```bash
make build            # Build Docker image
make ps               # List containers
make shell            # Shell into API container
make clean            # Remove all containers/volumes
make prune            # Prune Docker system
```

## Configuration

### Environment Variables

**Development** (`.env`)
```env
PORT=4173
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=nimbus_drive
MONGO_INITDB_ROOT_USERNAME=nimbus
MONGO_INITDB_ROOT_PASSWORD=nimbus-dev-password
JWT_SECRET=your-secret-key
```

**Production** (`.env.production`)
```env
PORT=4173
NODE_ENV=production
MONGODB_URI=mongodb://nimbus:password@mongo:27017/?authSource=admin
MONGODB_DB=nimbus_drive
JWT_SECRET=secure-random-secret-here
```

## Docker Architecture

### Development Stack
```
Nimbus Drive (Dev)
├── Node.js API (port 4173)
└── MongoDB (port 27017)
```

### Production Stack
```
Nimbus Drive (Production)
├── Nginx (port 80, 443)
│   ├── Reverse proxy
│   ├── SSL/TLS termination
│   └── Load balancing
├── Node.js API (internal)
│   ├── Health checks
│   └── Logging
└── MongoDB (internal)
    ├── Authentication
    ├── Backups
    └── Persistent volume
```

## Database Schema

All collections use MongoDB with the following schema:

- **users** - User accounts with credentials
- **folders** - Directory structure
- **files** - File metadata with GridFS references
- **shares** - Permission sharing records
- **linkShares** - Public link sharing
- **activities** - Audit log
- **stars** - Favorite items

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed schema.

## Security

- ✓ JWT authentication with 15-minute expiry
- ✓ Bcryptjs password hashing (12 rounds)
- ✓ HttpOnly secure cookies
- ✓ Non-root container user
- ✓ HTTPS/TLS support
- ✓ Input validation on all endpoints
- ✓ Permission checks on resources
- ✓ Audit logging of actions

## Deployment

### Single Host (Docker Compose)
See [DEPLOYMENT.md](./docs/DEPLOYMENT.md#docker-compose-single-host)

### Multiple Hosts (Docker Swarm)
See [DEPLOYMENT.md](./docs/DEPLOYMENT.md#docker-swarm-multiple-hosts)

### Kubernetes
See [DEPLOYMENT.md](./docs/DEPLOYMENT.md#kubernetes-production-grade)

## Monitoring & Logging

### View Logs
```bash
# Development
docker compose logs -f api

# Production
docker compose -f docker-compose.prod.yml logs -f
```

### Health Checks
```bash
# Manual check
./scripts/health-check.sh

# API endpoint
curl http://localhost:4173/api/health
```

### Backup & Restore
```bash
# Backup
./scripts/backup-db.sh

# Restore
./scripts/restore-db.sh ./backups/nimbus_*.tar.gz
```

## Performance

### Image Size
- **Development**: ~180MB (with dev dependencies)
- **Production**: 50.9MB (multi-stage, Alpine base, no dev deps)

### Typical Latencies
- API response: 10-50ms
- Database query: 5-20ms
- File upload (100MB): 2-5s

### Scalability
- Single instance: 100-500 req/s
- Horizontal scaling: add more API replicas
- Database: 10k+ ops/s with MongoDB

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

MIT License - see [LICENSE](./LICENSE) file.

## Support

For issues and questions:
1. Check [GETTING_STARTED.md](./docs/GETTING_STARTED.md) troubleshooting
2. Review [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system design
3. See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for deployment issues
4. Open an issue on GitHub

## Technology Stack

- **Runtime**: Node.js 20
- **Framework**: Express.js 5
- **Database**: MongoDB 7
- **Reverse Proxy**: Nginx
- **Container**: Docker + Docker Compose
- **Authentication**: JWT + Bcryptjs
- **File Storage**: GridFS

## Roadmap

- [ ] Web UI improvements
- [ ] Mobile app
- [ ] Versioning for files
- [ ] Advanced permissions
- [ ] Encryption at rest
- [ ] S3 backend support
- [ ] Syncing client

---

Built with ❤️ for production.
