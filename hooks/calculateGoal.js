

 const calculateCalories = (gender, weight, height, age, activityLevel, goal) => {
    let BMR;
  
    if (gender === "male") {
      BMR = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
      BMR = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }
  
    // Коэффициент активности
    const activityMultipliers = {
      "sedentary": 1.2,        // Малоподвижный образ жизни
      "light": 1.375,         // Легкие упражнения 1-3 раза в неделю
      "moderate": 1.55,       // Тренировки 3-5 раз в неделю
      "active": 1.725,        // Тренировки 6-7 раз в неделю
      "very_active": 1.9      // Спортсмен, тяжелая физическая работа
    };
  
    const TDEE = BMR * (activityMultipliers[activityLevel] || 1.2);
  
    // Коррекция под цель (похудение / набор веса)
    let adjustedCalories;
    if (goal === "lose") {
      adjustedCalories = TDEE - 500; // Дефицит 500 калорий для похудения
    } else if (goal === "gain") {
      adjustedCalories = TDEE + 500; // Профицит 500 калорий для набора
    } else {
      adjustedCalories = TDEE; // Поддержание веса
    }
  
    return Math.round(adjustedCalories);
  };

  const calculateNutrients = (calories, proteinCoef, fatCoef , weight) => {
    const protein = Math.round(proteinCoef * weight) ;
    const fat = Math.round(fatCoef * weight);
    const carbs = Math.round((calories - (protein * 4 + fat * 9)) / 4);
    return {
      protein,
      fat,
      carbs,
    };

  }

  module.exports = calculateCalories, calculateNutrients;