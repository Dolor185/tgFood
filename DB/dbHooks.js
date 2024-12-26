const NutrientLog = require("./NutrientLog");
const CustomProduct = require("./CustomProduct");

const addAndUpdate = (userId, nutrients) => {
  return NutrientLog.findOneAndUpdate(
    { userId }, // Поиск по userId
    {
      $inc: {
        // Увеличиваем значения полей нутриентов
        "totalNutrients.calories": nutrients.calories,
        "totalNutrients.protein": nutrients.protein,
        "totalNutrients.fat": nutrients.fat,
        "totalNutrients.carbs": nutrients.carbs,
      },
    },
    { upsert: true, new: true } // Создать новую запись, если она не найдена
  );
};

const findTotal = (userId) => {
  return NutrientLog.find({ userId }).sort({ date: -1 }).limit(1);
};

const resetTotal = (userId) => {
  return NutrientLog.updateMany(
    { userId },
    {
      $set: {
        "totalNutrients.calories": 0,
        "totalNutrients.protein": 0,
        "totalNutrients.fat": 0,
        "totalNutrients.carbs": 0,
      },
    }
  );
};

const addCustom = (userId, name, calories, protein, fat, carbs) => {
  return new CustomProduct({
    userId, // Привязываем продукт к пользователю
    name,
    calories,
    protein,
    fat,
    carbs,
  });
};

const findCustom = (productId) => {
  return CustomProduct.findById(productId);
};
const customsList = () => {
  return CustomProduct.find();
};

const deleteCustom = (productId) => {
  return CustomProduct.deleteOne({ _id: productId });
};

module.exports = {
  addAndUpdate,
  findTotal,
  resetTotal,
  addCustom,
  findCustom,
  customsList,
  deleteCustom,
};
