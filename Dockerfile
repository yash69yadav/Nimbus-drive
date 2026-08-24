# syntax=docker/dockerfile:1

# Build stage: compile dependencies and prepare application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only dependency manifests first for better cache efficiency
COPY package.json ./

# Install dependencies with production flag
RUN npm install --omit=dev && npm cache clean --force

# Copy source code
COPY server.js app.js ./
COPY mongodb ./mongodb
COPY index.html styler.css ./

# Runtime stage: lean production image
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy node_modules and application from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/*.js ./
COPY --from=builder --chown=nodejs:nodejs /app/mongodb ./mongodb
COPY --from=builder --chown=nodejs:nodejs /app/*.html ./
COPY --from=builder --chown=nodejs:nodejs /app/*.css ./

# Set environment variables
ENV NODE_ENV=production \
    PORT=4173

# Expose application port
EXPOSE 4173

# Use non-root user
USER nodejs

# Healthcheck to ensure container is healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:4173/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

# Start application
CMD ["node", "server.js"]
