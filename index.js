require("dotenv").config();
const { startServer } = require("./Api/server");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const connectDB = require("./DB/db"); // Импортируйте файл подключения к БД
const NutrientLog = require("./DB/NutrientLog");

startServer();
connectDB();
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let totalNutrients = {
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
};

// Функция для поиска информации о продукте
const searchFood = async (query) => {
  try {
    const response = await axios.get("http://localhost:3000/food-search", {
      params: { query },
    });
    // Проверяем, что в ответе есть объект 'foods' и массив 'food'
    if (response.data && response.data.foods && response.data.foods.food) {
      return response.data.foods.food; // Возвращаем массив продуктов
    } else {
      return []; // Если нет продуктов, возвращаем пустой массив
    }
  } catch (error) {
    console.error("Error searching for food:", error.message);
    return [];
  }
};

// Опции клавиатуры с кнопками
const options = {
  reply_markup: {
    keyboard: [
      ["/addFood", "/dayTotal"], // Кнопки
      ["/reset", "/help"], // Кнопка сброса и дополнительная кнопка
    ],
    resize_keyboard: true, // Автоматический размер клавиатуры
    one_time_keyboard: true, // Скрывать клавиатуру после нажатия
  },
};

// Функция для отправки приветственного сообщения с кнопками
const sendWelcomeMessage = (chatId) => {
  bot.sendMessage(
    chatId,
    `Привет! Я помогу тебе вести дневник питания. Выбери опцию:`,
    options
  );
};

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  sendWelcomeMessage(msg.chat.id);
});
let currentFood = null;
// Обработка нажатия на кнопку /addFood
bot.onText(/\/addFood/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Отправь мне название продукта для поиска:`,
    options // Добавляем клавиатуру в ответе
  );
});

// Обработка текстовых сообщений для поиска продуктов
bot.on("message", async (msg) => {
  const text = msg.text;

  // Проверка, что сообщение не является командой
  if (text.startsWith("/")) {
    return; // Игнорируем команды
  }

  // Если это запрос на добавление еды
  if (msg.text && msg.text !== "Отмена") {
    const foods = await searchFood(text);

    if (foods && foods.length > 0) {
      const buttons = foods.map((food, index) => {
        const nutrients = parseNutrients(food.food_description);
        let brand = "";
        if (food.brand_name) {
          brand = food.brand_name;
        }
        return {
          text: `${brand} ${food.food_name} (КБЖУ: ${nutrients.calories} ккал, ${nutrients.protein} г белков, ${nutrients.fat} г жиров, ${nutrients.carbs} г углеводов)`,
          callback_data: `${index}:${food.food_id}`, // Передаем индекс и описание продукта
        };
      });

      // Отправляем сообщение с найденными продуктами и кнопками
      const replyMarkup = {
        inline_keyboard: buttons.map((button) => [
          { text: button.text, callback_data: button.callback_data },
        ]),
      };

      bot.sendMessage(msg.chat.id, "Выберите продукт:", {
        reply_markup: replyMarkup,
      });
    } else {
      bot.sendMessage(msg.chat.id, `Продукт не найден.`, options);
    }
  }
});

// Обработка выбора продукта из списка
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data.split(":");
  const index = parseInt(data[0]);
  const foodDescription = data[1];

  try {
    const foods = await searchFood(foodDescription);
    if (foods && foods.length > 0) {
      const food = foods[index];
      console.log(food);
      const nutrients = parseNutrients(food.food_description);

      // Получаем единицы измерения продукта
      const unit = getUnitFromDescription(food.food_description);
      let brand = "";
      if (food.brand_name) {
        brand = food.brand_name;
      }

      // Запросить количество в указанных единицах
      bot.sendMessage(
        msg.chat.id,
        `Введите количество в "${unit}" для "${brand} ${food.food_name}\n ${food.food_description}":`
      );

      // Обработка ввода количества
      bot.once("message", async (weightMsg) => {
        const quantity = parseFloat(weightMsg.text);

        if (!isNaN(quantity) && quantity > 0) {
          const conversionFactor = getConversionFactor(unit); // Получаем коэффициент перевода в граммы, если необходимо

          // Добавляем в общий счетчик с учетом единиц измерения
          const adjustedNutrients = adjustNutrients(
            nutrients,
            quantity,
            conversionFactor
          );

          totalNutrients.calories += adjustedNutrients.calories;
          totalNutrients.protein += adjustedNutrients.protein;
          totalNutrients.fat += adjustedNutrients.fat;
          totalNutrients.carbs += adjustedNutrients.carbs;

          // Сохранение данных в MongoDB
          const nutrientLog = new NutrientLog({ totalNutrients });
          await nutrientLog.save();

          bot.sendMessage(
            msg.chat.id,
            `Ты добавил: ${food.food_description}, ${quantity} ${unit}\nКБЖУ: ${adjustedNutrients.calories} ккал, ${adjustedNutrients.protein} г белков, ${adjustedNutrients.fat} г жиров, ${adjustedNutrients.carbs} г углеводов`,
            options // Добавляем клавиатуру в ответе
          );
        } else {
          bot.sendMessage(
            msg.chat.id,
            `Пожалуйста, введите корректное количество.`,
            options
          );
        }
      });
    }
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Ошибка: ${error.message}`, options);
  }
});

// Обработка нажатия на кнопку /dayTotal
bot.onText(/\/dayTotal/, async (msg) => {
  try {
    const logs = await NutrientLog.find().sort({ date: -1 }).limit(1); // Получите последний лог
    if (logs.length > 0) {
      const { totalNutrients } = logs[0];
      bot.sendMessage(
        msg.chat.id,
        `Дневной счетчик:\nКалории: ${totalNutrients.calories} ккал\nБелки: ${totalNutrients.protein} г\nЖиры: ${totalNutrients.fat} г\nУглеводы: ${totalNutrients.carbs} г`,
        options // Добавляем клавиатуру в ответе
      );
    } else {
      bot.sendMessage(
        msg.chat.id,
        "Данные дневного счетчика отсутствуют.",
        options
      );
    }
  } catch (error) {
    bot.sendMessage(
      msg.chat.id,
      `Ошибка при получении данных: ${error.message}`,
      options // Добавляем клавиатуру в ответе
    );
  }
});

// Обработка нажатия на кнопку /reset
bot.onText(/\/reset/, (msg) => {
  totalNutrients = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
  };

  // Сохранение нового лог-файла с нулями
  const nutrientLog = new NutrientLog({ totalNutrients });
  nutrientLog.save(); // Не дожидаемся завершения, просто сохраняем

  bot.sendMessage(msg.chat.id, "Дневной счетчик сброшен.", options);
});

// Парсер нутриентов из описания
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

const adjustNutrients = (nutrients, quantity, conversionFactor) => {
  const factor = (quantity * conversionFactor) / 100;
  return {
    calories: nutrients.calories * factor,
    protein: nutrients.protein * factor,
    fat: nutrients.fat * factor,
    carbs: nutrients.carbs * factor,
  };
};

const getConversionFactor = (unit) => {
  const conversions = {
    oz: 28.3495,
    ml: 1, // для жидкостей это 1 мл = 1 г
    slice: 50, // к примеру, 1 слайс = 50 г, это можно варьировать
    // добавьте другие единицы по необходимости
  };
  return conversions[unit] || 1; // по умолчанию 1, если это граммы
};

const getUnitFromDescription = (description) => {
  // Пример: "Per 1 slice - Calories: 100 kcal"
  const match = description.match(/Per\s+([\d.]+)\s*(\w+)/);
  return match ? match[2] : "g"; // Если единица не найдена, используем граммы
};
