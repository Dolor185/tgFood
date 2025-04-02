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
  products: [
    {
      id: Number,
      name: String,
      amount: Number,
      metric_serving_unit: String,
      nutrients: {
        calories: Number,
        protein: Number,
        fat: Number,
        carbs: Number,
      },
    },
  ],
  totalNutrients: {
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
  },
});

const NutrientLog = mongoose.model("NutrientLog", nutrientLogSchema);

module.exports = NutrientLog;
