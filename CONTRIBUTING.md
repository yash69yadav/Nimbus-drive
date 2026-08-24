# Contributing to Nimbus Drive

Thank you for contributing! Here's how you can help:

## Development Setup

1. **Clone & Install**
   ```bash
   git clone <repo>
   cd project-1
   npm install
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   ```

3. **Start Development**
   ```bash
   make dev
   ```

## Code Standards

- **Format**: ESM modules (import/export)
- **Style**: Consistent with existing codebase
- **Testing**: Run `npm test` before commit
- **Linting**: Use ESLint if available

## Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally
3. Commit with clear messages: `git commit -m "feat: add new feature"`
4. Push and create a Pull Request

## Commit Messages

Use conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `test:` Tests
- `chore:` Maintenance

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Docker Guidelines

- Keep images minimal (Alpine base)
- Non-root users for security
- Multi-stage builds for production
- Document build requirements

## Questions?

Open an issue or contact the maintainers.
