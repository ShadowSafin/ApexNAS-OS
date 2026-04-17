# NAS-OS Backend

Phase 1 backend service for NAS-OS.

## Run

1. cp .env.example .env
2. npm install
3. npm run seed
4. npm run dev

## API

- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/system/health
- GET /api/system/version
- GET /api/system/info (auth required)
