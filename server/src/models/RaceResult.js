import mongoose from "mongoose";

const raceResultSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      index: true,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    players: [
      {
        username: { type: String, required: true },
        place: { type: Number, required: true },
        finishTimeMs: { type: Number, default: null },
        bestLapMs: { type: Number, default: null },
        lap: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

export const RaceResult = mongoose.model("RaceResult", raceResultSchema);
