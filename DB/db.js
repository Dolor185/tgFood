const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI); // Без лишних опций
    console.log("Подключение к MongoDB успешно");
  } catch (error) {
    console.error("Ошибка подключения к MongoDB:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
