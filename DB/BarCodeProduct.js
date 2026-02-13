const mongoose = require("mongoose");

const servingSchema = new mongoose.Schema(
  {
    serving_id: { type: String, required: true },
    serving_description: { type: String, required: true },

    metric_serving_amount: { type: String, required: true }, // "100"
    metric_serving_unit: { type: String, required: true },   // "g"
    number_of_units: { type: String, required: true },       // "0.000" grams / "1.000" units

    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    fat: { type: Number, required: true },
    carbohydrate: { type: Number, required: true },
  },
  { _id: false }
);

const barCodeProductSchema = new mongoose.Schema(
  {
    barcode: { type: String, required: true, unique: true, index: true },
    source: { type: String, default: "local" },

    // ✅ FatSecret-like fields (что ждёт твоя Modal)
    food_id: { type: String, required: true }, // например "local:071234..."
    food_name: { type: String, required: true },
    servings: {
      serving: { type: [servingSchema], default: [] },
    },
  },
  { timestamps: true }
);

const BarCodeProduct = mongoose.model("BarCodeProduct", barCodeProductSchema);
module.exports = BarCodeProduct;
