.PHONY: help dev prod build up down logs shell test clean

help:
	@echo "Nimbus Drive - Project Management Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev              - Start development environment"
	@echo "  make dev-logs         - View development logs"
	@echo "  make dev-stop         - Stop development environment"
	@echo ""
	@echo "Production:"
	@echo "  make prod-build       - Build production image"
	@echo "  make prod-up          - Start production environment"
	@echo "  make prod-down        - Stop production environment"
	@echo "  make prod-logs        - View production logs"
	@echo ""
	@echo "Docker:"
	@echo "  make build            - Build Docker image"
	@echo "  make shell            - Open shell in running container"
	@echo "  make ps               - List running containers"
	@echo ""
	@echo "Testing & Cleanup:"
	@echo "  make test             - Run test suite"
	@echo "  make clean            - Remove all containers and volumes"
	@echo "  make prune            - Prune Docker system"

# Development
dev:
	docker compose up --pull always -d
	@echo "✓ Development environment started"
	@echo "  API: http://localhost:4173"
	@echo "  MongoDB: mongodb://localhost:27017"

dev-logs:
	docker compose logs -f

dev-stop:
	docker compose down
	@echo "✓ Development environment stopped"

# Production
prod-build:
	docker compose -f docker-compose.prod.yml build --no-cache

prod-up: prod-build
	docker compose -f docker-compose.prod.yml up -d
	@echo "✓ Production environment started"
	@echo "  API: http://localhost"

prod-down:
	docker compose -f docker-compose.prod.yml down
	@echo "✓ Production environment stopped"

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

# Docker
build:
	docker build -t project1-api:latest .
	@echo "✓ Image built successfully"

shell:
	docker exec -it project1-api-1 sh

ps:
	docker compose ps

# Testing
test:
	docker compose exec api npm test

# Cleanup
clean:
	docker compose down -v
	docker compose -f docker-compose.prod.yml down -v
	@echo "✓ Cleaned up all containers and volumes"

prune:
	docker system prune -f
	docker volume prune -f
	@echo "✓ Docker system pruned"

.DEFAULT_GOAL := help
