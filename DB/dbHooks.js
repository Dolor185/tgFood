const NutrientLog = require("./NutrientLog");
const CustomProduct = require("./CustomProduct");

const addAndUpdate = async (userId, nutrients, products) => {
  if (
    !nutrients ||
    typeof nutrients.calories !== "number" ||
    typeof nutrients.protein !== "number" ||
    typeof nutrients.fat !== "number" ||
    typeof nutrients.carbs !== "number"
  ) {
    throw new TypeError("Неверный объект nutrients");
  }
  if (
    !products ||
    typeof products.name !== "string" ||
    typeof products.amount !== "number" ||
    typeof products.nutrients !== "object"
  ) {
    throw new TypeError("Неверный объект product");
  }

  const result = await NutrientLog.findOneAndUpdate(
    { userId }, // Поиск по userId
    {
      $inc: {
        // Увеличиваем значения полей нутриентов
        "totalNutrients.calories": nutrients.calories,
        "totalNutrients.protein": nutrients.protein,
        "totalNutrients.fat": nutrients.fat,
        "totalNutrients.carbs": nutrients.carbs,
      },
      $push: {
        products: products,
      },
    },
    { upsert: true, new: true, returnDocument: "after" } // Создать новую запись, если она не найдена
  );

  return result;
};

const findTotal = (userId) => {
  return NutrientLog.find({ userId }).sort({ date: -1 }).limit(1);
};

const resetTotal = (userId) => {
  return NutrientLog.updateMany(
    { userId },
    {
      $set: {
        products: [],
        totalNutrients: {
          calories: 0,
          protein: 0,
          fat: 0,
          carbs: 0,
        },
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

const findAndDelete = async (userId, productId) => {
  // Найти продукт для удаления
  const log = await NutrientLog.findOne({ userId });
  const productToDelete = log.products.find(
    (product) => product.id === Number(productId)
  );

  if (!productToDelete) {
    throw new Error("Продукт не найден");
  }

  // Удалить продукт и обновить totalNutrients
  return NutrientLog.updateOne(
    { userId },
    {
      $pull: { products: { id: Number(productId) } },
      $inc: {
        "totalNutrients.calories": -productToDelete.nutrients.calories,
        "totalNutrients.protein": -productToDelete.nutrients.protein,
        "totalNutrients.fat": -productToDelete.nutrients.fat,
        "totalNutrients.carbs": -productToDelete.nutrients.carbs,
      },
    }
  );
};
module.exports = {
  addAndUpdate,
  findTotal,
  resetTotal,
  addCustom,
  findCustom,
  customsList,
  deleteCustom,
  findAndDelete,
};
