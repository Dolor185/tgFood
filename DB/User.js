const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true,
  },
  gender: {
    type: String,
    enum: ["male", "female"],
    required: true,
  },
  weight: { type: Number, required: true },
  height: { type: Number, required: true },
  age: { type: Number, required: true },
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
    protein: { type: Number, required: true },
    fat: { type: Number, required: true },
    carbs: { type: Number, required: true },
  },

  recommendedNutrients: {
    protein: { type: Number },
    fat: { type: Number },
    carbs: { type: Number },
  },

  period: {
    type: Number,
    default: 1,
  },
});

const User = mongoose.model("User", userSchema);
module.exports = User;
