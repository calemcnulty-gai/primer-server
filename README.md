# Young Lady's Illustrated Primer - API Server

The backend API server for the Young Lady's Illustrated Primer, built with Express and TypeScript.

## Tech Stack

- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: TBD (likely PostgreSQL)
- **Authentication**: Device ID based authentication
- **API Documentation**: OpenAPI/Swagger
- **Testing**: Jest
- **Deployment**: Docker (planned)

## Project Structure

```
server/
├── src/                      # Source code
│   ├── config/              # Configuration files
│   │   └── database.ts      # Database configuration
│   ├── controllers/         # Request handlers
│   │   ├── primer/         # Primer-specific controllers
│   │   └── user/           # User management controllers
│   ├── models/             # Data models
│   │   ├── interfaces/     # TypeScript interfaces
│   │   └── schemas/        # Database schemas
│   ├── routes/             # API routes
│   │   ├── v1/            # Version 1 API routes
│   │   └── index.ts       # Route aggregation
│   ├── middleware/         # Custom middleware
│   │   ├── deviceId.ts    # Device ID authentication
│   │   ├── error.ts       # Error handling
│   │   └── validation.ts  # Request validation
│   ├── services/          # Business logic
│   │   ├── primer/        # Primer-specific services
│   │   └── user/          # User-related services
│   └── utils/             # Utility functions
├── tests/                  # Test files
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
└── dist/                  # Compiled JavaScript
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start development server:
```bash
npm run dev
```

Server will be available at http://localhost:3000

## API Structure

The API follows RESTful principles and is versioned:

- `/api/v1/health` - Health check endpoint
- `/api/v1/users` - User management
- `/api/v1/primer` - Primer-specific endpoints

### Authentication

The API uses device ID based authentication. To authenticate requests:

1. Include an `X-Device-ID` header with a unique device identifier
2. This ID will be used to track the user's story progress and preferences
3. All authenticated endpoints require this header

## Development Guidelines

1. **Code Organization**
   - Follow modular architecture
   - Keep controllers thin
   - Business logic goes in services
   - Use TypeScript types/interfaces

2. **API Design**
   - Follow REST principles
   - Version all endpoints
   - Validate requests
   - Return consistent responses

3. **Error Handling**
   - Use custom error classes
   - Consistent error responses
   - Proper error logging

4. **Testing**
   - Write unit tests for services
   - Integration tests for APIs
   - Maintain good coverage

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run test` - Run tests
- `npm run lint` - Run linter
- `npm run clean` - Clean build directory
