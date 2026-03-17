# RAO RACING

`RAO RACING` is a browser-based multiplayer 3D car racing MVP built with:

- Frontend: React (Vite), Three.js, Tailwind CSS
- Backend: Node.js, Express, Socket.io
- Database: MongoDB (leaderboard + race history)

## Architecture (brief)

- Server is authoritative for multiplayer simulation:
  - Maintains rooms, players, race phases (`lobby -> countdown -> racing -> finished`)
  - Runs physics tick (20Hz), handles lap counting, finish detection, collisions
  - Broadcasts `room:state` snapshots over Socket.io
- Client renders 3D scene with Three.js:
  - Smooth interpolation of remote car positions
  - Third-person follow camera
  - HUD (speed, lap, position, nitro, mini leaderboard)
  - Keyboard + mobile touch controls
- MongoDB stores:
  - Per-user aggregate stats (`wins`, `races`, `bestLapMs`)
  - Race result history

## Features Included

- Real-time multiplayer rooms (create/join with room code)
- Host-controlled game start with `3...2...1...GO!` countdown
- Player usernames above cars
- Car physics (acceleration, brake, friction, steering)
- Track boundary collision + car-vs-car collision
- 3-lap race logic + finish line detection
- Solo practice mode
- Nitro boost system
- Basic engine sound using Web Audio oscillator
- Results screen with leaderboard
- Global leaderboard endpoint backed by MongoDB

## Project Structure

```text
rao-racing/
  client/
    src/
      components/
      pages/
      game/
  server/
    server.js
    socket.js
    src/
      models/
      services/
      utils/
```

## Setup

### 1) Backend

```bash
cd server
# Windows PowerShell: Copy-Item .env.example .env
# macOS/Linux: cp .env.example .env
npm install
npm run dev
```

Server default URL: `http://localhost:4000`

### 2) Frontend

```bash
cd client
# Windows PowerShell: Copy-Item .env.example .env
# macOS/Linux: cp .env.example .env
npm install
npm run dev
```

Client default URL: `http://localhost:5173`

## Environment Variables

### `server/.env`

```env
PORT=4000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/rao-racing
```

### `client/.env`

```env
VITE_SERVER_URL=http://localhost:4000
```

## Deploy

### Frontend (Vercel)

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Env var: `VITE_SERVER_URL=https://<your-backend-domain>`

### Backend (Render / Railway)

- Root directory: `server`
- Start command: `npm start`
- Env vars:
  - `PORT` (provided by platform)
  - `CLIENT_URL` (your frontend domain)
  - `MONGO_URI` (Atlas or hosted MongoDB)

## API + Socket Events

### REST

- `GET /api/health`
- `GET /api/leaderboard`

### Socket.io events

- `room:create`
- `room:join`
- `room:leave`
- `race:start`
- `race:restart`
- `player:input`
- `room:state` (server broadcast)
