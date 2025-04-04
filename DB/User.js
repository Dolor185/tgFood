const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: {
    type: Number, // ID пользователя в Telegram
    required: true,
    unique: true,
  },
  gender: {
    type: String,
    enum: ["male", "female"],
    required: true,
  },
  weight: { type: Number, required: true }, // Вес в кг
  height: { type: Number, required: true }, // Рост в см
  age: { type: Number, required: true }, // Возраст в годах
  activityLevel: {
    type: String,
    enum: ["sedentary", "light", "moderate", "active", "very_active"],
    required: true,
  },
  goal: {
    type: String,
    enum: ["lose", "maintain", "gain"],
    required: true,
  },
  dailyCalories: { type: Number, required: true }, 

  nutrients: {
    protein: { type: Number, required: true }, // Белки
    fat: { type: Number, required: true }, // Жиры
    carbs: { type: Number, required: true }, // Углеводы
  },
  
});

const User = mongoose.model("User", userSchema);
module.exports = User
