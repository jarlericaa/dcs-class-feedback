# Class Feedback Platform

A comprehensive feedback and Q&A platform for classes, built with modern web technologies.

## Tech Stack

- **Frontend**: Next.js 15, React 18, Tailwind CSS, shadcn/ui
- **Backend**: NestJS with Express
- **Database**: PostgreSQL with Prisma ORM
- **Background Jobs**: pg-boss
- **Email**: Resend
- **Authentication**: Supabase Google OAuth
- **Validation**: Zod
- **Testing**: Vitest, Playwright, Testcontainers
- **Package Manager**: pnpm
- **Monorepo**: Turborepo

## Project Structure

```
├── apps/
│   ├── api/           # NestJS REST API server
│   ├── web/           # Next.js frontend application
│   └── worker/        # Background job worker
├── packages/
│   ├── database/      # Prisma ORM and migrations
│   ├── contracts/     # Shared types and validation
│   ├── permissions/   # Role-based authorization
│   ├── email/         # Email service and templates
│   ├── ui/            # Shared React components
│   └── config/        # Shared configuration
├── docs/              # Project documentation
└── docker-compose.yml # Local development infrastructure
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker and Docker Compose

### Setup

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in required values:
   ```bash
   cp .env.example .env.local
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Start PostgreSQL:
   ```bash
   docker-compose up -d
   ```

5. Set up the database:
   ```bash
   pnpm db:migrate:dev
   ```

6. Start development servers:
   ```bash
   pnpm dev
   ```

   This will start:
   - Web app: http://localhost:3000
   - API: http://localhost:3001 (with Swagger docs at /api/docs)
   - Worker: Background job processor

## Development Scripts

- `pnpm build` - Build all packages
- `pnpm dev` - Start all development servers
- `pnpm test` - Run all tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:e2e` - Run E2E tests
- `pnpm lint` - Lint all code
- `pnpm format` - Format all code
- `pnpm type-check` - Type-check all code
- `pnpm clean` - Clean all build artifacts

## Database

- `pnpm db:migrate` - Run pending migrations in production
- `pnpm db:migrate:dev` - Create and run migrations in development
- `pnpm db:push` - Push schema changes to database
- `pnpm db:studio` - Open Prisma Studio

## Features (MVP)

- Google authentication with school domains
- Course management with CRS roster import
- Reusable feedback templates with scheduled releases
- Student submissions with drafting and editing
- Submission validity tracking and bonus credit calculation
- Student question triage and backlog management
- Private and public Q&A with anonymization
- Email notifications for key events
- Instructor exports for responses and bonus records
- Comprehensive audit logging

## Documentation

- [PROJECT_SPEC.md](docs/project-specs.md) - Product specification and requirements
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture and design decisions
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - Developer guide and conventions

## Code Quality

- TypeScript with strict mode
- ESLint for linting
- Prettier for formatting
- Vitest for unit/integration tests
- Playwright for E2E tests
- Testcontainers for real database testing

All code must pass linting, formatting, and type checking before commit.

## License

Proprietary
