# Groovely

Groovely is a full-stack dance application: a **React** web client (with optional **Capacitor** for iOS) backed by a **FastAPI** service that runs **MediaPipe**-based pose analysis, video handling, and **Supabase** integration for storage and data.

## Tech stack

| Layer | Technologies |
|--------|---------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Backend | Python, FastAPI, Uvicorn, MediaPipe, OpenCV |
| Platform | Supabase (client + server SDKs) |

## Prerequisites

- **Node.js** 18+ and npm (for the frontend)
- **Python** 3.10+ (for the backend)
- **FFmpeg** (used by the backend for video processing; install via your OS package manager)

## Backend

From the repository root:

```bash
cd backend
./setup-venv.sh          # recommended: creates .venv and installs dependencies
./start.sh               # serves the API (default: http://0.0.0.0:5000)
```

Or run Uvicorn directly (with dependencies installed and `backend` as the working directory):

```bash
python -m uvicorn api.main:app --host 0.0.0.0 --port 5000 --reload
```

Configure a `backend/.env` file as needed for your environment. For Supabase-backed features, set **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`**. Optional values include `ALLOWED_ORIGINS`, `PORT`, `DEBUG`, and `API_KEY`. If Supabase is not configured, the server starts with reduced functionality and logs a warning.

## Frontend

```bash
cd frontend
cp .env.example .env     # then edit with your Supabase and API URLs
npm install
npm run dev
```

Use `VITE_API_URL` pointing at your running backend (e.g. `http://localhost:5000` in development). See `frontend/.env.example` for all variables.

### Other scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## Repository layout

- `frontend/` — Vite + React application (and Capacitor config for native builds)
- `backend/` — FastAPI app (`api/main.py`), analysis scripts, migrations, and runtime storage under `backend/storage/` (see `.gitignore` for ignored paths)
