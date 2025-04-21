const mongoose = require("mongoose");

const foodHistorySchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  date: { type: Date, required: true },
  products: [
    {
      name: String,
      amount: Number,
      metric_serving_unit: String,
      calories: Number,
      protein: Number,
      fat: Number,
      carbs: Number,
    }
  ],
  total: {
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
  }
});

const FoodHistory = mongoose.model("FoodHistory", foodHistorySchema);
module.exports = FoodHistory;
