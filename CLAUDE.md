# Primer Server Codebase Guidelines

## Commands
- Build: `npm run build`
- Dev mode: `npm run dev`
- Lint: `npm run lint`
- Test: `npm test`
- Test with watch: `npm run test:watch`
- Test with coverage: `npm run test:coverage`
- Run single test: `npx jest -t "test name"` or `npx jest path/to/test.test.ts`

## Code Style
- TypeScript with strict type checking
- Use ES6+ features and async/await for asynchronous code
- Class-based architecture for models and services
- Import paths use `@/*` alias for src directory
- Follow BDD testing pattern with Jest
- Organize tests in `__tests__` directories alongside implementation
- Error handling: use explicit Error classes and try/catch blocks
- Naming: camelCase for variables/functions, PascalCase for classes/interfaces

## Project Structure
- `/src`: Source code organized by feature/responsibility
- `/config`: Application configuration
- `/controllers`: Request handlers
- `/models`: Data models and interfaces
- `/services`: Business logic
- `/middleware`: Express middleware
- `/routes`: API routes
- `/test`: Test utilities and setup