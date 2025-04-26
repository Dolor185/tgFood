const mongoose = require("mongoose");

const foodHistorySchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  history: {
    type: Map, // Ключ: дата (строка), значение: объект total + продукты
    of: new mongoose.Schema({
      total: {
        calories: Number,
        protein: Number,
        fat: Number,
        carbs: Number,
      },
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
      ]
    }),
    default: {},
  }
});

foodHistorySchema.index({userId:1})

const FoodHistory = mongoose.model("FoodHistory", foodHistorySchema);
module.exports = FoodHistory;
