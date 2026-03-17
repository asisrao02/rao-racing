import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 24,
    },
    normalizedUsername: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    races: {
      type: Number,
      default: 0,
    },
    wins: {
      type: Number,
      default: 0,
    },
    bestLapMs: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
