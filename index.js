require("dotenv").config();
const { startServer } = require("./Api/server");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const connectDB = require("./DB/db"); // Импортируйте файл подключения к БД
const NutrientLog = require("./DB/NutrientLog");
const CustomProduct = require("./DB/CustomProduct");

startServer();
connectDB();
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let searchedFoods = {};
let isSelected = false;
let currentPage = 1;
let isAddingProduct = false;

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
      ["/Reset💽", "/Help🆘"],
      ["/favourites", "/addFavourite"], // Кнопка сброса и дополнительная кнопка
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

  if (text.startsWith("/") || isAddingProduct) return;
  if (isSelected) return;

  if (msg.text && msg.text !== "Отмена") {
    // Сохраняем запрос для поиска продуктов
    userSearchQueries[msg.chat.id] = text;

    const buttons = await getProducts(text, currentPage, msg.chat.id);

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
  if (action.startsWith("fav_") || action.startsWith("rem_")) {
    return;
  }
  if (action === "next_page") {
    currentPage++; // Увеличиваем номер страницы
  } else if (action === "previous_page" && currentPage > 1) {
    currentPage--; // Уменьшаем номер страницы, если он больше 1
  } else if (!isNaN(action)) {
    // Если action — это число, то это food_id выбранного продукта
    const foodId = action; // Получаем food_id из callback_data
    isSelected = true;
    const foods = searchedFoods[msg.chat.id] || []; // Получаем сохранённые продукты по chatId
    // Найти выбранный продукт
    console.log("Selected foodId:", foodId);
    const selectedFood = foods.find((food) => food.food_id === foodId);
    console.log("Selected food:", selectedFood);
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

          const userId = msg.chat.id; // Получаем Telegram user id

          // Найти запись пользователя и обновить её, если она существует, либо создать новую
          await NutrientLog.findOneAndUpdate(
            { userId }, // Поиск по userId
            {
              $inc: {
                // Увеличиваем значения полей нутриентов
                "totalNutrients.calories": adjustedNutrients.calories,
                "totalNutrients.protein": adjustedNutrients.protein,
                "totalNutrients.fat": adjustedNutrients.fat,
                "totalNutrients.carbs": adjustedNutrients.carbs,
              },
            },
            { upsert: true, new: true } // Создать новую запись, если она не найдена
          );

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
    const userId = msg.chat.id; // Используем chat.id как уникальный идентификатор пользователя
    const logs = await NutrientLog.find({ userId }).sort({ date: -1 }).limit(1); // Поиск логов по userId

    if (logs.length > 0) {
      const { totalNutrients } = logs[0];
      bot.sendMessage(
        msg.chat.id,
        `Ваш дневной счетчик:\n Калории: ${totalNutrients.calories} ккал\n Белки: ${totalNutrients.protein}г\n Жиры: ${totalNutrients.fat}г\n Углеводы: ${totalNutrients.carbs}г`,
        options // клавиатура
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
      options
    );
  }
});

// Обработка нажатия на кнопку /reset
bot.onText(/\/Reset💽/, async (msg) => {
  try {
    const userId = msg.chat.id;
    // Сбрасываем данные по текущему пользователю
    await NutrientLog.updateMany(
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

    bot.sendMessage(msg.chat.id, "Ваш дневной счетчик был сброшен.", options);
  } catch (error) {
    bot.sendMessage(
      msg.chat.id,
      `Ошибка при сбросе данных: ${error.message}`,
      options
    );
  }
});

bot.onText(/\/addFavourite/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Введите название продукта:");

  // Ожидаем название продукта
  bot.once("message", (nameMsg) => {
    const productName = nameMsg.text;

    bot.sendMessage(chatId, "Введите калории на 100 грамм:");

    // Ожидаем количество калорий
    bot.once("message", (caloriesMsg) => {
      const calories = parseFloat(caloriesMsg.text);

      if (isNaN(calories)) {
        return bot.sendMessage(
          chatId,
          "Пожалуйста, введите корректное количество калорий."
        );
      }

      bot.sendMessage(chatId, "Введите количество белков на 100 грамм:");

      // Ожидаем количество белков
      bot.once("message", (proteinMsg) => {
        const protein = parseFloat(proteinMsg.text);

        if (isNaN(protein)) {
          return bot.sendMessage(
            chatId,
            "Пожалуйста, введите корректное количество белков."
          );
        }

        bot.sendMessage(chatId, "Введите количество жиров на 100 грамм:");

        // Ожидаем количество жиров
        bot.once("message", (fatMsg) => {
          const fat = parseFloat(fatMsg.text);

          if (isNaN(fat)) {
            return bot.sendMessage(
              chatId,
              "Пожалуйста, введите корректное количество жиров."
            );
          }

          bot.sendMessage(chatId, "Введите количество углеводов на 100 грамм:");

          // Ожидаем количество углеводов
          bot.once("message", async (carbsMsg) => {
            const carbs = parseFloat(carbsMsg.text);

            if (isNaN(carbs)) {
              return bot.sendMessage(
                chatId,
                "Пожалуйста, введите корректное количество углеводов."
              );
            }

            // Сохраняем продукт в MongoDB
            const newProduct = new CustomProduct({
              userId: chatId, // Привязываем продукт к пользователю
              name: productName,
              calories,
              protein,
              fat,
              carbs,
            });

            try {
              await newProduct.save();
              bot.sendMessage(
                chatId,
                `Продукт "${productName}" успешно добавлен в избранное!`
              );
            } catch (error) {
              bot.sendMessage(chatId, "Ошибка при сохранении продукта.");
              console.error(error);
            }
          });
        });
      });
    });
  });
});

bot.onText(/\/favourites/, async (msg) => {
  const favourites = await CustomProduct.find();
  isCustomsProducts = true;
  if (favourites.length === 0) {
    bot.sendMessage(msg.chat.id, "У вас нет сохраненных продуктов.");
  } else {
    const buttons = favourites.map((product) => ({
      text: `${product.name} (КБЖУ: ${product.calories} ккал, ${product.protein} г белков, ${product.fat} г жиров, ${product.carbs} г углеводов)`,
      callback_data: `fav_${product._id}`,
    }));

    const replyMarkup = {
      inline_keyboard: buttons.map((button) => [button]),
    };

    bot.sendMessage(msg.chat.id, "Ваши избранные продукты:", {
      reply_markup: replyMarkup,
    });
  }
});
// обработка событий при выборе продуктов из избранных
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const action = callbackQuery.data;

  if (action.startsWith("fav_")) {
    const productId = action.split("_")[1];
    const product = await CustomProduct.findById(productId);

    if (product) {
      isSelected = true;
      // Спрашиваем у пользователя, какой вес в граммах он хочет указать
      bot.sendMessage(
        msg.chat.id,
        `Введите вес продукта ${product.name}(${product.calories}К|${product.protein}Б|${product.fat}Ж|${product.carbs}У) в граммах:`
      );

      // Ожидаем ввода веса от пользователя
      bot.once("message", async (weightMsg) => {
        const weight = parseFloat(weightMsg.text);

        if (!isNaN(weight) && weight > 0) {
          // Рассчитываем КБЖУ на основе веса
          const factor = weight / 100;
          const adjustedNutrients = {
            calories: product.calories * factor,
            protein: product.protein * factor,
            fat: product.fat * factor,
            carbs: product.carbs * factor,
          };

          const userId = msg.chat.id;
          // Обновляем запись пользователя в MongoDB
          await NutrientLog.findOneAndUpdate(
            { userId }, // Поиск по userId
            {
              $inc: {
                "totalNutrients.calories": adjustedNutrients.calories,
                "totalNutrients.protein": adjustedNutrients.protein,
                "totalNutrients.fat": adjustedNutrients.fat,
                "totalNutrients.carbs": adjustedNutrients.carbs,
              },
            },
            { upsert: true, new: true } // Создать новую запись, если она не найдена
          );
          isSelected = false;
          bot.sendMessage(
            msg.chat.id,
            `Ты добавил: ${
              product.name
            }, вес: ${weight} г\nКБЖУ: ${adjustedNutrients.calories.toFixed(
              2
            )} ккал, ${adjustedNutrients.protein.toFixed(
              2
            )} г белков, ${adjustedNutrients.fat.toFixed(
              2
            )} г жиров, ${adjustedNutrients.carbs.toFixed(2)} г углеводов`
          );
        } else {
          bot.sendMessage(msg.chat.id, "Пожалуйста, введите корректный вес.");
        }
      });
    } else {
      bot.sendMessage(msg.chat.id, "Продукт не найден.");
    }
  }
});

bot.onText(/\/removeFavourite/, async (msg) => {
  const products = await CustomProduct.find();
  if (products.length === 0) {
    bot.sendMessage(msg.chat.id, "У вас нет сохраненных продуктов.");
  } else {
    const buttons = products.map((product) => ({
      text: `${product.name} (КБЖУ: ${product.calories} ккал, ${product.protein} г белков, ${product.fat} г жиров, ${product.carbs} г углеводов)`,
      callback_data: `rem_${product._id}`,
    }));
    const replyMarkup = {
      inline_keyboard: buttons.map((button) => [button]),
    };
    bot.sendMessage(msg.chat.id, "Выбирите продукт из списка для удаления:", {
      reply_markup: replyMarkup,
    });
  }
});
// пробую реализовать удаление продуктов из избранных !!!!!!!!
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const action = callbackQuery.data;
  if (action.startsWith("rem_")) {
    const productId = action.split("_")[1];
    const product = await CustomProduct.findById(productId);
    if (product) {
      isSelected = true;
      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "Yes", callback_data: "remY" },
            { text: "No", callback_data: "remN" },
          ],
        ],
      };

      bot.sendMessage(
        msg.chat.id,
        `Вы действительно хотите удалить продукт ${product.name}?`,
        {
          reply_markup: replyMarkup,
        }
      );
    }
    bot.on("callback_query", (callbackQuery) => {
      const msg = callbackQuery.message;
      const action = callbackQuery.action;

      if (action.startsWith("remN")) {
        bot.sendMessage(msg.chat.id, `Удаление отменено`);
      }
    });
  }
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
