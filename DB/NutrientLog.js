const mongoose = require("mongoose");

const nutrientLogSchema = new mongoose.Schema({
  userId: {
    type: Number, // Telegram chat ID (или msg.from.id)
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  totalNutrients: {
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
  },
});

const NutrientLog = mongoose.model("NutrientLog", nutrientLogSchema);

module.exports = NutrientLog;
