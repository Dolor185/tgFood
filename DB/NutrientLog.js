const mongoose = require("mongoose");

const nutrientLogSchema = new mongoose.Schema({
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
