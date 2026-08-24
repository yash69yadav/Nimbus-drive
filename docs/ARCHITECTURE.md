# Architecture Overview

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
│                    (HTML/CSS/JavaScript)                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ HTTP/HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (Reverse Proxy)                    │
│  • Load balancing                                             │
│  • SSL/TLS termination                                        │
│  • Gzip compression                                           │
│  • Static file serving                                        │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ Internal Network
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Node.js Express API Server                       │
│  • REST API endpoints                                         │
│  • Authentication (JWT)                                       │
│  • File upload/download                                       │
│  • Business logic                                             │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ MongoDB Driver
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB (Database)                         │
│  • User data                                                  │
│  • File metadata                                              │
│  • Folders & sharing                                          │
│  • GridFS file storage                                        │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **HTML5** - Markup
- **CSS3** - Styling
- **JavaScript (ES6+)** - Interactivity

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **MongoDB** - Database
- **JWT** - Authentication
- **Bcryptjs** - Password hashing
- **Multer** - File upload
- **GridFS** - Large file storage

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Orchestration
- **Nginx** - Reverse proxy & load balancing
- **Makefile** - Command automation

## Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  email: String (unique),
  name: String,
  passwordHash: String,
  imageUrl: String (optional),
  createdAt: Date
}
```

### Folders Collection
```javascript
{
  _id: ObjectId,
  type: "folder",
  name: String,
  ownerId: ObjectId (ref: users),
  parentId: ObjectId (ref: folders, optional),
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date (optional)
}
```

### Files Collection
```javascript
{
  _id: ObjectId,
  type: "file",
  name: String,
  mimeType: String,
  sizeBytes: Number,
  gridfsId: ObjectId,
  ownerId: ObjectId (ref: users),
  folderId: ObjectId (ref: folders, optional),
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date (optional)
}
```

### Shares Collection
```javascript
{
  resourceType: "file" | "folder",
  resourceId: ObjectId,
  granteeUserId: ObjectId,
  role: "viewer" | "editor",
  createdBy: ObjectId,
  createdAt: Date
}
```

### Activities Collection (Audit Log)
```javascript
{
  actorId: ObjectId,
  action: String,
  resourceType: "file" | "folder",
  resourceId: ObjectId,
  context: Object,
  createdAt: Date
}
```

## API Flow

### Authentication
```
1. User submits credentials
2. Server validates against passwordHash
3. JWT generated with userId & email
4. Token sent to client (httpOnly cookie)
5. Client includes token in Authorization header
6. Server verifies token on protected routes
```

### File Upload
```
1. Client submits file via multipart/form-data
2. Multer stores in memory buffer
3. GridFS streams file to MongoDB
4. File metadata stored in files collection
5. Activity logged
6. Response with file object
```

### File Download
```
1. Client requests /api/files/:id/download
2. Server checks permissions
3. GridFS retrieves file stream
4. Server pipes to response
5. Activity logged
6. Client receives file
```

### Folder Navigation
```
1. Client requests /api/folders/:id
2. Server checks user permission
3. Query all children (folders & files)
4. Return hierarchical structure
5. Client renders UI
```

## Security Architecture

### Authentication
- JWT tokens (15-minute expiry)
- HttpOnly cookies prevent XSS
- Bcryptjs with salt rounds (12)

### Authorization
- User ownership validation
- Sharing model for collaboration
- Role-based access (viewer/editor)

### Data Protection
- Passwords hashed, never stored plaintext
- Sensitive data in environment variables
- HTTPS in production (Nginx termination)
- CORS headers configured

### Input Validation
- Email format validation
- Password strength (8+ chars)
- Filename validation (no slashes)
- File size limits (100MB)

## Deployment Architecture

### Development
```
Docker Compose (single host)
├── MongoDB (with volume)
├── Node.js API
└── exposed ports (4173, 27017)
```

### Production (Docker Compose)
```
Docker Compose (single host)
├── MongoDB (with volume)
├── Node.js API (health checks)
├── Nginx (port 80/443)
└── Named network
```

### Production (Kubernetes)
```
K8s Cluster
├── API Deployment (3+ replicas)
├── MongoDB StatefulSet
├── Nginx Service (LoadBalancer)
├── ConfigMaps (config)
├── Secrets (credentials)
└── PersistentVolumes (data)
```

## Scalability Considerations

### Horizontal Scaling
- Stateless API servers
- Shared MongoDB database
- Load balancer (Nginx/K8s)

### Vertical Scaling
- Increase container resources
- Database query optimization
- Caching layer (Redis)

### Database Optimization
- Indexes on frequently queried fields
- TTL indexes for session cleanup
- GridFS for large files
- Connection pooling

## Performance Characteristics

### Latencies (typical)
- API response: 10-50ms (no DB)
- Database query: 5-20ms
- File upload (100MB): 2-5s
- File download: network-dependent

### Throughput
- Single instance: 100-500 req/s
- MongoDB: 10k+ ops/s
- GridFS: limited by network/disk

### Resource Usage
- API container: 50-200MB RAM
- MongoDB: 100-500MB (varies)
- Nginx: 10-50MB RAM
- Total: ~500MB minimum per instance

## Monitoring Points

### Application Metrics
- Request latency (p50, p95, p99)
- Error rate
- Active users
- Database response time

### System Metrics
- CPU usage
- Memory usage
- Disk I/O
- Network throughput

### Database Metrics
- Query performance
- Connection count
- Replication lag
- Index usage

## Disaster Recovery

### Backup Strategy
- Daily MongoDB dumps
- 7-day retention
- Offsite replication

### Recovery Time Objectives (RTO)
- API: < 5 minutes (restart container)
- Database: < 30 minutes (restore from backup)

### Recovery Point Objectives (RPO)
- Daily incremental backups
- ~24 hour data loss tolerance
