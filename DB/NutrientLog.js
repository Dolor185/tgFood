const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  id: Number,
  entryId: String,
  name: String,
  amount: Number,
  metric_serving_unit: String,
  nutrients: {
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
  }
}, { _id: false });

const nutrientLogSchema = new mongoose.Schema({
  userId: {
    type: Number, // Telegram chat ID (или msg.from.id)
    required: true,
  },
  date: {
    type: String,
    required: true
  },
  meals: {
    Breakfast: [productSchema],
    Lunch: [productSchema],
    Dinner: [productSchema],
    Snacks: [productSchema],
  },
  
  totalNutrients: {
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
  },
});

nutrientLogSchema.index({ userId: 1, date: 1 }, { unique: true });

const NutrientLog = mongoose.model("NutrientLog", nutrientLogSchema);

module.exports = NutrientLog;
