const parseNutrients = (description) => {
  const match = description.match(
    /Calories:\s*([\d.]+)kcal.*Fat:\s*([\d.]+)g.*Carbs:\s*([\d.]+)g.*Protein:\s*([\d.]+)g/
  );
  if (!match) {
    return { calories: 0, fat: 0, carbs: 0, protein: 0 }; // если не удалось распарсить
  }
  return {
    calories: parseFloat(match[1]),
    fat: parseFloat(match[2]),
    carbs: parseFloat(match[3]),
    protein: parseFloat(match[4]),
  };
};

module.exports = parseNutrients;
