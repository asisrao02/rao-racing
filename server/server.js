import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { setupSocket } from "./socket.js";
import { User } from "./src/models/User.js";
import { RaceResult } from "./src/models/RaceResult.js";

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || "";

const ALLOWED_ORIGINS = [
  "https://rao-racing.vercel.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin/server-to-server calls with no browser Origin header.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "rao-racing-server",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.get("/api/leaderboard", async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      res.json({ leaders: [] });
      return;
    }

    const leaders = await User.find({})
      .sort({ wins: -1, bestLapMs: 1, races: -1, updatedAt: -1 })
      .limit(20)
      .lean();

    res.json({
      leaders: leaders.map((leader, index) => ({
        rank: index + 1,
        username: leader.username,
        wins: leader.wins,
        races: leader.races,
        bestLapMs: leader.bestLapMs,
      })),
    });
  } catch (error) {
    console.error("Leaderboard fetch failed:", error.message);
    res.status(500).json({ leaders: [] });
  }
});

app.use((error, _req, res, next) => {
  if (error?.message?.startsWith("CORS blocked")) {
    console.error(error.message);
    res.status(403).json({ error: "CORS origin not allowed" });
    return;
  }
  next(error);
});

function normalizeUsername(username) {
  return String(username).trim().toLowerCase();
}

async function persistRaceResults(room) {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const players = [...room.players.values()]
    .sort((a, b) => {
      const placeA = a.place ?? 9999;
      const placeB = b.place ?? 9999;
      if (placeA !== placeB) {
        return placeA - placeB;
      }

      if (typeof a.score === "number" || typeof b.score === "number") {
        if ((a.score ?? 0) !== (b.score ?? 0)) {
          return (b.score ?? 0) - (a.score ?? 0);
        }
        if ((a.kills ?? 0) !== (b.kills ?? 0)) {
          return (b.kills ?? 0) - (a.kills ?? 0);
        }
        return (a.deaths ?? 0) - (b.deaths ?? 0);
      }

      if ((a.lap ?? 0) !== (b.lap ?? 0)) {
        return (b.lap ?? 0) - (a.lap ?? 0);
      }

      return (b.progress ?? 0) - (a.progress ?? 0);
    })
    .map((player, index) => ({
      username: player.username,
      place: player.place ?? index + 1,
      finishTimeMs: player.finishTimeMs ?? null,
      bestLapMs: player.bestLapMs ?? null,
      lap: player.lap ?? 0,
      score: player.score ?? 0,
      kills: player.kills ?? 0,
      deaths: player.deaths ?? 0,
    }));

  if (!players.length) {
    return;
  }

  await Promise.all(
    players.map(async (entry) => {
      const normalizedUsername = normalizeUsername(entry.username);
      const user = await User.findOneAndUpdate(
        { normalizedUsername },
        {
          $setOnInsert: {
            username: entry.username,
            normalizedUsername,
          },
          $inc: {
            races: 1,
            wins: entry.place === 1 ? 1 : 0,
          },
        },
        { upsert: true, new: true }
      );

      if (entry.bestLapMs) {
        const shouldUpdateBest = !user.bestLapMs || entry.bestLapMs < user.bestLapMs;
        if (shouldUpdateBest) {
          user.bestLapMs = entry.bestLapMs;
          await user.save();
        }
      }
    })
  );

  await RaceResult.create({
    roomCode: room.code,
    durationMs: room.startedAt && room.finishedAt ? room.finishedAt - room.startedAt : null,
    players,
  });
}

setupSocket(server, { onRaceFinished: persistRaceResults });

async function bootstrap() {
  if (MONGO_URI) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log("MongoDB connected");
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
    }
  } else {
    console.warn("MONGO_URI missing. Leaderboard persistence disabled.");
  }

  server.listen(PORT, () => {
    console.log(`RAO RACING server listening on port ${PORT}`);
  });
}

bootstrap();
