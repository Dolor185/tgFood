const NutrientLog = require("./NutrientLog");
const User = require("./User");


const addAndUpdate = async (userId, date, meal, nutrients, product) => {
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
    !product ||
    typeof product.name !== "string" ||
    typeof product.amount !== "number" ||
    typeof product.nutrients !== "object"
  ) {
    throw new TypeError("Неверный объект продукта");
  }

  const update = {
    $inc: {
      "totalNutrients.calories": nutrients.calories,
      "totalNutrients.protein": nutrients.protein,
      "totalNutrients.fat": nutrients.fat,
      "totalNutrients.carbs": nutrients.carbs,
    },
    $push: {
      [`meals.${meal}`]: product,
    },
  };

  const result = await NutrientLog.findOneAndUpdate(
    { userId, date },
    update,
    { upsert: true, new: true }
  );

  return result;
};

const findTotal = (userId, date) => {
  return NutrientLog.findOne({ userId, date });
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


const findAndDelete = async (userId, entryId, date) => {
  const log = await NutrientLog.findOne({ userId, date });

  if (!log) throw new Error("Лог пользователя не найден");

  
  let mealKey = null;
  let productToDelete = null;

  for (const key of ["Breakfast", "Lunch", "Dinner", "Snacks"]) {
    const meal = log.meals[key];
    const found = meal.find((p) => p.entryId === entryId);
    if (found) {
      mealKey = key;
      productToDelete = found;
      break;
    }
  }

  if (!productToDelete) {
    throw new Error("Продукт не найден");
  }

  // Удаляем и обновляем нутриенты
  return NutrientLog.updateOne(
    { userId, date },
    {
      $pull: { [`meals.${mealKey}`]: { entryId } },
      $inc: {
        "totalNutrients.calories": -productToDelete.nutrients.calories,
        "totalNutrients.protein": -productToDelete.nutrients.protein,
        "totalNutrients.fat": -productToDelete.nutrients.fat,
        "totalNutrients.carbs": -productToDelete.nutrients.carbs,
      },
    }
  );
};



const isFirstLogin = async (userId) => {
  const log = await User.findOne({ userId });
  if (!log) {
    
    return true; 
  }
  return false; 
};
module.exports = {
  addAndUpdate,
  findTotal,
  resetTotal,
  isFirstLogin,
  findAndDelete,
};
