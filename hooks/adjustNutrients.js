const adjustNutrients = (nutrients, quantity, baseAmount) => {
  const factor = quantity / baseAmount; // Пропорция от базового количества (например, от 100г или 1 штуки)
  return {
    calories: nutrients.calories * factor,
    protein: nutrients.protein * factor,
    fat: nutrients.fat * factor,
    carbs: nutrients.carbs * factor,
  };
};

module.exports = adjustNutrients;
