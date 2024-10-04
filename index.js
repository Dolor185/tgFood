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
let searchedFoods = {};
let isSelected = false;
let currentPage = 1;

// Функция для поиска информации о продукте
const searchFood = async (query, page = 0) => {
  try {
    const response = await axios.get("http://localhost:3000/food-search", {
      params: { query, page },
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
      ["/NewProduct🥕", "/Total🔎"], // Кнопки
      ["/Reset💽", "/Help🆘"], // Кнопка сброса и дополнительная кнопка
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

// Обработка нажатия на кнопку /addFood
bot.onText(/\/NewProduct🥕/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Отправь мне название продукта для поиска:`,
    options // Добавляем клавиатуру в ответе
  );
});

// Обработка текстовых сообщений для поиска продуктов
bot.on("message", async (msg) => {
  const text = msg.text;

  if (text.startsWith("/")) return; // Игнорируем команды
  if (isSelected) return;

  if (msg.text && msg.text !== "Отмена") {
    // Сохраняем запрос для поиска продуктов
    userSearchQueries[msg.chat.id] = text;

    const buttons = await getProducts(text, currentPage);
    console.log(searchedFoods);

    if (buttons && buttons.length > 0) {
      const replyMarkup = {
        inline_keyboard: [
          ...buttons.map((button) => [
            { text: button.text, callback_data: button.callback_data },
          ]),
          // Добавляем кнопки для навигации
          [
            { text: "Предыдущая страница", callback_data: "previous_page" },
            { text: "Следующая страница", callback_data: "next_page" },
          ],
        ],
      };

      bot.sendMessage(msg.chat.id, "Выберите продукт:", {
        reply_markup: replyMarkup,
      });
    } else {
      bot.sendMessage(msg.chat.id, `Продукт не найден.`, options);
    }
  }
});
// Добавляем объект для хранения текущего запроса на каждого пользователя
let userSearchQueries = {};

// Обработка callback_query для навигации страниц и выбора продукта
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const action = callbackQuery.data; // Получаем action от кнопок (например, next_page, previous_page или food_id)

  // Если пользователь нажал на "Следующая страница" или "Предыдущая страница"
  if (action === "next_page") {
    currentPage++; // Увеличиваем номер страницы
  } else if (action === "previous_page" && currentPage > 1) {
    currentPage--; // Уменьшаем номер страницы, если он больше 1
  } else if (!isNaN(action)) {
    // Если action — это число, то это food_id выбранного продукта
    const foodId = action; // Получаем food_id из callback_data
    isSelected = true;
    const foods = searchedFoods[msg.chat.id]; // Получаем сохранённые продукты по chatId

    // Найти выбранный продукт
    const selectedFood = foods.find((food) => food.food_id === foodId);

    if (selectedFood) {
      const nutrients = parseNutrients(selectedFood.food_description);
      const { amount, unit } = getUnitAndAmountFromDescription(
        selectedFood.food_description
      );
      const brand = selectedFood.brand_name ? selectedFood.brand_name : "";

      // Спрашиваем количество в соответствующей единице (граммы или штуки)
      bot.sendMessage(
        msg.chat.id,
        `Введите количество в "${unit}" для "${brand} ${selectedFood.food_name}\n ${selectedFood.food_description}":`
      );

      // Ожидание ответа пользователя с количеством
      bot.once("message", async (weightMsg) => {
        const quantity = parseFloat(weightMsg.text);

        if (!isNaN(quantity) && quantity > 0) {
          // Рассчитываем нутриенты на основе введённого количества и базовой единицы (100г или 1 штука)
          const adjustedNutrients = adjustNutrients(
            nutrients,
            quantity,
            amount
          );

          totalNutrients.calories += adjustedNutrients.calories;
          totalNutrients.protein += adjustedNutrients.protein;
          totalNutrients.fat += adjustedNutrients.fat;
          totalNutrients.carbs += adjustedNutrients.carbs;

          // Сохранение данных в MongoDB
          const nutrientLog = new NutrientLog({ totalNutrients });
          await nutrientLog.save();
          isSelected = false;

          // Отправляем сообщение с добавленными нутриентами
          bot.sendMessage(
            msg.chat.id,
            `Ты добавил: ${
              selectedFood.food_description
            }, ${quantity} ${unit}\nКБЖУ: ${adjustedNutrients.calories.toFixed(
              2
            )} ккал, ${adjustedNutrients.protein.toFixed(
              2
            )} г белков, ${adjustedNutrients.fat.toFixed(
              2
            )} г жиров, ${adjustedNutrients.carbs.toFixed(2)} г углеводов`,
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
    } else {
      bot.sendMessage(msg.chat.id, "Продукт не найден.", options);
    }
    return; // Выходим из функции, если был выбран продукт
  }

  // Загружаем продукты для новой страницы
  try {
    // Используем сохранённый запрос пользователя для поиска
    const searchQuery = userSearchQueries[msg.chat.id];
    if (!searchQuery) {
      bot.sendMessage(msg.chat.id, `Запрос для поиска не найден.`);
      return;
    }

    // Выполняем новый запрос с обновленной страницей
    const buttons = await getProducts(searchQuery, currentPage, msg.chat.id);

    if (buttons && buttons.length > 0) {
      const replyMarkup = {
        inline_keyboard: [
          ...buttons.map((button) => [
            { text: button.text, callback_data: button.callback_data },
          ]),
          // Кнопки для навигации
          [
            { text: "Предыдущая страница", callback_data: "previous_page" },
            { text: "Следующая страница", callback_data: "next_page" },
          ],
        ],
      };

      // Изменяем клавиатуру текущего сообщения
      await bot.editMessageReplyMarkup(replyMarkup, {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
      });
    } else {
      bot.sendMessage(msg.chat.id, `Продукты не найдены.`, options);
    }
  } catch (error) {
    console.error("Ошибка при загрузке продуктов:", error);
    bot.sendMessage(msg.chat.id, `Произошла ошибка при загрузке продуктов.`);
  }
});

// Обработка нажатия на кнопку /dayTotal
bot.onText(/\/Total🔎/, async (msg) => {
  try {
    const logs = await NutrientLog.find().sort({ date: -1 }).limit(1); // Получите последний лог
    if (logs.length > 0) {
      const { totalNutrients } = logs[0];
      bot.sendMessage(
        msg.chat.id,
        `Дневной счетчик:\n Калории: ${totalNutrients.calories} ккал\n Белки: ${totalNutrients.protein}г \n Жиры: ${totalNutrients.fat}г \n Углеводы: ${totalNutrients.carbs}г`,
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
bot.onText(/\/Reset💽/, (msg) => {
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

const adjustNutrients = (nutrients, quantity, baseAmount) => {
  const factor = quantity / baseAmount; // Пропорция от базового количества (например, от 100г или 1 штуки)
  return {
    calories: nutrients.calories * factor,
    protein: nutrients.protein * factor,
    fat: nutrients.fat * factor,
    carbs: nutrients.carbs * factor,
  };
};

const getUnitAndAmountFromDescription = (description) => {
  // Пример: "Per 100g" или "Per 1 medium apple"
  const match = description.match(/Per\s+([\d.]+)\s*(\w+\s*\w*)/);
  if (match) {
    return {
      amount: parseFloat(match[1]), // Количество, например 100 (грамм) или 1 (яблоко)
      unit: match[2], // Единица измерения, например "g" или "medium apple"
    };
  }
  return { amount: 100, unit: "g" }; // По умолчанию 100г, если ничего не найдено
};

const getProducts = async (query, page, chatId) => {
  const foods = await searchFood(query, page);

  if (foods && foods.length > 0) {
    searchedFoods[chatId] = foods;

    const buttons = foods.map((food) => {
      const nutrients = parseNutrients(food.food_description);
      let brand = food.brand_name ? food.brand_name : "";
      return {
        text: `${brand} ${food.food_name} (КБЖУ: ${nutrients.calories} ккал, ${nutrients.protein} г белков, ${nutrients.fat} г жиров, ${nutrients.carbs} г углеводов)`,
        callback_data: `${food.food_id}`,
      };
    });

    return buttons;
  }
};
