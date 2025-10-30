const mongoose = require("mongoose");

const barCodeProductSchema = new mongoose.Schema({
    barcode : {type: String, required : true, unique : true},
    name : {type: String, required : true},
    metric_serving_unit: {type: String, required : true},
    nutrients : {
        calories: {type: Number, required : true},
        protein: {type: Number, required : true},
        fat: {type: Number, required : true},
        carbs: {type: Number, required : true},
        
    }
},{ timestamps: true });

const BarCodeProduct = mongoose.model("BarCodeProduct", barCodeProductSchema);

module.exports = BarCodeProduct;