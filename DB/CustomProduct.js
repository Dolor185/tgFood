const mongoose = require("mongoose");

const customProductSchema = new mongoose.Schema({
  userId: { type: Number, required: true }, // ID пользователя
  name: { type: String, required: true }, // Название продукта
  calories: { type: Number, required: true }, // Калории на 100 г
  protein: { type: Number, required: true }, // Белки на 100 г
  fat: { type: Number, required: true }, // Жиры на 100 г
  carbs: { type: Number, required: true }, // Углеводы на 100 г
});

const CustomProduct = mongoose.model("CustomProduct", customProductSchema);

module.exports = CustomProduct;
