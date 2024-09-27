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

  // Если текущий продукт не выбран
  if (!currentFood) {
    // Если это запрос на добавление еды
    if (text && text !== "Отмена") {
      const foods = await searchFood(text);

      if (foods && foods.length > 0) {
        const buttons = foods.map((food, index) => {
          const nutrients = parseNutrients(food.food_description);
          return {
            text: `${food.food_description} (КБЖУ: ${nutrients.calories} ккал, ${nutrients.protein} г белков, ${nutrients.fat} г жиров, ${nutrients.carbs} г углеводов)`,
            callback_data: `${index}:${food.food_description.replace(
              /:/g,
              ""
            )}`, // Удаляем двоеточия
          };
        });

        // Отправляем сообщение с найденными продуктами и кнопками
        const replyMarkup = {
          inline_keyboard: buttons.map((button) => [
            {
              text: button.text,
              callback_data: button.callback_data.slice(0, 64),
            }, // Ограничиваем длину до 64 символов
          ]),
        };

        bot.sendMessage(msg.chat.id, "Выберите продукт:", {
          reply_markup: replyMarkup,
        });
      } else {
        bot.sendMessage(msg.chat.id, `Продукт не найден.`, options);
      }
    }
  } else {
    // Если текущий продукт уже выбран, обрабатываем ввод веса
    const weight = parseFloat(text);

    if (!isNaN(weight) && weight > 0) {
      const weightFactor = weight / 100; // переводим вес в проценты от 100 грамм

      // Получаем нутриенты для текущего продукта
      const nutrients = parseNutrients(currentFood.food_description);

      // Добавляем в общий счетчик
      totalNutrients.calories += nutrients.calories * weightFactor;
      totalNutrients.protein += nutrients.protein * weightFactor;
      totalNutrients.fat += nutrients.fat * weightFactor;
      totalNutrients.carbs += nutrients.carbs * weightFactor;

      // Сохранение данных в MongoDB
      const nutrientLog = new NutrientLog({ totalNutrients });
      await nutrientLog.save();

      bot.sendMessage(
        msg.chat.id,
        `Ты добавил: ${currentFood.food_description}, ${weight} г\nКБЖУ: ${
          nutrients.calories * weightFactor
        } ккал, ${nutrients.protein * weightFactor} г белков, ${
          nutrients.fat * weightFactor
        } г жиров, ${nutrients.carbs * weightFactor} г углеводов`,
        options // Добавляем клавиатуру в ответе
      );

      currentFood = null; // Сбрасываем текущее состояние
    } else {
      bot.sendMessage(
        msg.chat.id,
        `Пожалуйста, введите корректный вес в граммах.`,
        options
      );
    }
  }
});

// Обработка выбора продукта из списка
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data.split(":");
  const index = parseInt(data[0]);
  const foodDescription = data.slice(1).join(":"); // Соединяем оставшуюся часть обратно

  try {
    const foods = await searchFood(foodDescription);
    if (foods && foods.length > 0 && index < foods.length) {
      // Проверка на корректность индекса
      currentFood = foods[index]; // Сохраняем текущий выбранный продукт
      const nutrients = parseNutrients(currentFood.food_description);

      // Попросить ввести вес
      bot.sendMessage(
        msg.chat.id,
        `Введите вес (г) для "${currentFood.food_description}":`
      );
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
