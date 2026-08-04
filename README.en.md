# Citadels Online

> **A non-official online version of the classic board game *Citadels* · 6-player 3v3 team battles**

Seize the night, forge the realm. Steel veiled in shadow, eightfold guises, scheming across the five-hued citadel — here, where every round holds a new scheme, the first to complete an eighth district takes the crown.

This is a non-official online implementation of the board game *Citadels*, featuring login, ranked team battles, AI autoplay and offline simulation, with server-authoritative rules.

- **中文**：[简体中文说明](./README.md)

<p>
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" />
  <img alt="Zustand" src="https://img.shields.io/badge/Zustand-5-593D88?logo=zustand&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white" />
  <img alt="Socket.IO" src="https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white" />
  <img alt="i18next" src="https://img.shields.io/badge/i18next-24-26A69A?logo=i18next&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## ✨ Features

- 🎮 **6-player 3v3 team battles**: teams split by seat parity, city completes at 8 districts, first finisher **+4** / same-round later **+2**
- ⚔️ **Eight classic roles**: Assassin, Thief, Magician, King, Bishop, Merchant, Architect and Warlord, each with a hidden art
- 🌆 **Five-hued district economy**: Noble, Religious, Trade, Military and Unique districts — hoard gold and build toward eight
- 🤖 **AI autoplay**: on turn timeout or disconnect the seat auto-delegates to the AI, so games never stall
- 🔀 **Offline simulation**: the rules engine can run a full game standalone, ideal for strategy evaluation and AI training
- 🌍 **Bilingual UI**: Simplified Chinese by default, switchable to English in one click

---

## 🛠 Tech Stack

| Module | Tech |
|---|---|
| Frontend `client-react/` | React 18 · Vite · Zustand · React Router · i18next |
| Backend `server/` | Express · Socket.IO · better-sqlite3 · JWT |
| Shared `common/` | Pure types / enums / view pure functions (unit-tested, act as the frontend behavior contract) |

A three-layer monorepo. The authoritative rules engine lives in `server/src/engine` and runs standalone without Socket.IO.

---

## 🚀 Quick Start (Development)

### Requirements

- Node.js **20.x LTS** (pinned to `20` in the repo `.nvmrc`)
- npm 10+

> On Windows, use `npm.cmd` if PowerShell blocks the `npm` command.

### 1. Install dependencies

Build order is **mandatory**: `common` must be built first, so `server` / `client-react` can reference its `dist`.

```bash
cd common && npm install && npm run build
cd ../server && npm install
cd ../client-react && npm install
```

### 2. One-click start (Windows)

Run from the repository root:

```powershell
.\scripts\dev-start.cmd          # starts backend (8081) + frontend (3010)
.\scripts\dev-restart.cmd        # stop then start (full-stack restart)
.\scripts\dev-stop.cmd           # stop backend + frontend
.\scripts\dev-status.cmd         # show pids, ports, addresses
```

Then open:

| Service | Address | Notes |
|---|---|---|
| Frontend (React) | http://127.0.0.1:**3010**/ | Vite dev, proxies `/s/` and `/api` to 8081 |
| Backend | http://127.0.0.1:**8081**/ | Express + Socket.IO |

> The Socket path is fixed at **`/s/`** (matches the frontend Vite proxy and the server; any change must be applied to both).

### 3. Manual two-process (Linux / macOS)

```bash
# Terminal 1 — backend
cd server
npm run start          # or npm run start:debug

# Terminal 2 — frontend
cd client-react
npm run dev -- --host 127.0.0.1 --port 3010
```

### 4. Local production-like build

```bash
npm run build            # builds common → client-react → server in order
node server/dist/index.js
```

Open only `http://localhost:8081` (or `PORT`) to verify static assets, `history` fallback and same-origin Socket.

---

## 📦 Common Scripts

The root `package.json` provides aggregate commands:

| Command | Purpose |
|---|---|
| `npm run build` | Builds common → client-react → server in order (run before deploy / release) |
| `npm run typecheck` | Builds common, then type-checks server |
| `npm run lint` | Runs ESLint on common / server / client-react in sequence |

Sub-packages additionally provide `test` (vitest), `typecheck`, etc. — see each `package.json`.

---

## 🧪 Testing

- `common`: unit tests for view pure functions (`vitest run`)
- `server`: core rules, AI evaluation, engine consistency, etc. (`npm run test --prefix server`)

See [scripts/README.md](./scripts/README.md) and [docs/TESTING.md](./docs/TESTING.md).

---

## 📄 Documentation Index

| Doc | Description |
|---|---|
| [docs/GAMERULES.md](./docs/GAMERULES.md) | Game rules and mode conventions |
| [docs/TESTING.md](./docs/TESTING.md) | Test structure, commands and case descriptions |
| [docs/UI_OPTIMIZATION_PLAN.md](./docs/UI_OPTIMIZATION_PLAN.md) | UI optimization plan (progress annotated, partly done) |
| [docs/IMPROVEMENT_PLAN_2026.md](./docs/IMPROVEMENT_PLAN_2026.md) | Historical optimization / refactor log |
| [docs/AI_ROADMAP.md](./docs/AI_ROADMAP.md) | AI strategy roadmap and evaluation system |
| [scripts/README.md](./scripts/README.md) | Deployment, operations and simulation notes |

> For production deployment (Aliyun one-click, daily updates, admin tunnel access, etc.), see [scripts/README.md](./scripts/README.md).

---

## 📌 Repository Layout

```text
common/        Shared types, enums and view pure functions (build first)
server/        Authoritative rules, rooms, Socket, database, offline engine
client-react/  React frontend
scripts/       Dev scripts, simulation and deployment scripts
docs/          Technical documentation
```

---

## ⚖️ License

Released under the [MIT License](./LICENSE). The board game *Citadels* was designed by Bruno Faidutti and belongs to its original designer and publishers; this project is for learning and technical exploration only and is non-commercial. Character and card artwork is AI-generated original material, not taken from the original game.

---

Play online: **https://www.citadels.cloud**
