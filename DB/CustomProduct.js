const mongoose = require("mongoose");

const customProductSchema = new mongoose.Schema({
  name: String,
  calories: Number,
  protein: Number,
  fat: Number,
  carbs: Number,
});

const CustomProduct = mongoose.model("CustomProduct", customProductSchema);

module.exports = CustomProduct;
