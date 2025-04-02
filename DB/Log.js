const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  isFirstLogin: {
    type: Boolean,
    default: false,
  },

});

const Log = mongoose.model("Log", logSchema);

module.exports = Log;
