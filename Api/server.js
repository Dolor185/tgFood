require("dotenv").config();
const axios = require("axios");
const User = require("../DB/User");
const qs = require("qs");
const express = require("express");
const cors = require("cors");
const app = express();
const CircularJSON = require("circular-json");
const {calculateCalories, calculateNutrients} = require('../hooks/calculateGoal')

const {
  addAndUpdate,
  findTotal,
  resetTotal,
  addCustom,
  findCustom,
  customsList,
  deleteCustom,
  findAndDelete,
  isFirstLogin
} = require("../DB/dbHooks");
const cron = require("node-cron");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(cors({ origin: "*" }));
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

let accessToken = "";
let tokenExpiration = 0;

cron.schedule("0 0 * * *", async () => {
  try {
    console.log("Running resetTotal at midnight");

    const users = await NutrientLog.distinct("userId");
    for (const userId of users) {
      await resetTotal(userId);
    }

    console.log("resetTotal completed for all users");
  } catch (error) {
    console.error("Error running resetTotal:", error.message);
  }
});

app.post("/get-token", async (req, res) => {
  try {
    const tokenResponse = await axios.post(
      "https://oauth.fatsecret.com/connect/token",
      qs.stringify({
        grant_type: "client_credentials",
        scope: "premier barcode", // Проверьте, что это тот scope, который вам нужен
      }), // Преобразуем параметры для x-www-form-urlencoded
      {
        auth: {
          username: apiKey, // Ваш API key
          password: apiSecret, // Ваш API secret
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Сохраняем токен и время истечения
    accessToken = tokenResponse.data.access_token;
    tokenExpiration = Date.now() + tokenResponse.data.expires_in * 1000;

    res.json(tokenResponse.data); // Отправляем ответ с данными токена
  } catch (error) {
    console.error(
      "Error getting token:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: error.message }); // Возвращаем ошибку клиенту
  }
});

const checkAndRefreshToken = async () => {
  if (!accessToken || Date.now() > tokenExpiration) {
    try {
      const tokenResponse = await axios.post(
        "https://oauth.fatsecret.com/connect/token",
        qs.stringify({
          grant_type: "client_credentials",
          scope: "premier barcode",
        }),
        {
          auth: {
            username: apiKey,
            password: apiSecret,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      accessToken = tokenResponse.data.access_token;
      tokenExpiration = Date.now() + tokenResponse.data.expires_in * 1000;
    } catch (error) {
      console.error(
        "Error refreshing token:",
        error.response ? error.response.data : error.message
      );
      throw new Error("Failed to refresh access token");
    }
  }
};

// Поиск продуктов
app.get("/food-search", async (req, res) => {
  const { query, page } = req.query;
  const url = `https://platform.fatsecret.com/rest/foods/search/v3`;

  try {
    // Проверяем и обновляем токен при необходимости
    await checkAndRefreshToken();

    // Выполняем запрос к FatSecret API
    const apiResponse = await axios.get(
      url,

      {
        params: {
          max_results: 10,
          page_number: page,
          search_expression: query,
          format: "json", // Указываем формат ответа
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    res.json(apiResponse.data); // Отправляем полученные данные клиенту
  } catch (error) {
    console.error(
      "Error fetching food data:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: error.message });
  }
});

app.get("/food-details", async (req, res) => {
  const { id } = req.query;
  const url = "https://platform.fatsecret.com/rest/food/v4";
  try {
    await checkAndRefreshToken();

    const apiResponse = await axios.get(
      url,

      {
        params: {
          food_id: id,
          format: "json", // Указываем формат ответа
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );
    res.json(apiResponse.data);
  } catch (error) {
    console.error(
      "Error fetching food details:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: error.message });
  }
});

app.get("/add-update", async (req, res) => {
  const { nutrients, user, products } = req.query;

  try {
    // Проверяем, является ли nutrients строкой
    if (typeof nutrients !== "string") {
      throw new TypeError("Nutrients must be a valid JSON string");
    }

    const parsedNutrients = JSON.parse(nutrients);
    const parsedProducts = JSON.parse(products);

    const result = await addAndUpdate(user, parsedNutrients, parsedProducts);

    res.status(200).json({ message: "Nutrients updated successfully" });
  } catch (error) {
    console.error("Error updating nutrients:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/check-nutrients", async (req, res) => {
  const { user } = req.query;
  try {
    const result = await findTotal(user);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching nutrients:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/reset-nutrients", async (req, res) => {
  const { user } = req.query;
  try {
    const result = await resetTotal(user);

    res.status(200).json({ message: "Nutrients reset successfully" });
  } catch (error) {
    console.error("Error resetting nutrients:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/delete-product", async (req, res) => {
  const { user, productId } = req.query;

  try {
    const result = await findAndDelete(user, productId);
    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "Продукт не найден или не удалён" });
    }
    res.status(200).json({ message: "Продукт успешно удалён", result });
  } catch (error) {
    console.error("Ошибка при удалении продукта:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/getByBarcode", async (req, res) => {
  const { barcode } = req.query;
  const url = "https://platform.fatsecret.com/rest/food/barcode/find-by-id/v1";
  try {
    await checkAndRefreshToken();

    const apiResponse = await axios.get(
      url,

      {
        params: {
          barcode: barcode,
          format: "json", // Указываем формат ответа
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );
    res.json(apiResponse.data);
  } catch (error) {
    console.error(
      "Error fetching food details:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: error.message });
  }
});

app.get("/first-open", async (req, res) => {
  const { user } = req.query;
//adadasddasdsdasd
  try {
    let userLog = await isFirstLogin(user);

      res.status(200).json(userLog);
    

    
  } catch (error) {
    console.error("Error checking first login:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/calculate-calories", async (req, res) => {
  try {
    console.log("Полученные данные:", req.body);

    const { userId, gender, weight, height, age, activityLevel, goal } = req.body;
    const dailyCalories = calculateCalories(gender, weight, height, age, activityLevel, goal);

    let proteinCoef 
    let fatCoef

    if(goal === "lose") {
      proteinCoef = 2.3
      fatCoef = 0.9
    }

    if(goal === "gain") {
      proteinCoef = 2.0
      fatCoef = 1.1
    }

    if(goal === "maintain") {
      proteinCoef = 1.8
      fatCoef = 1.0
    }

    const {protein, fat, carbs} = calculateNutrients(dailyCalories, proteinCoef, fatCoef, weight)

    const nutrients = {
      protein: protein,
      fat: fat,
      carbs: carbs
    };

    const user = new User({
      userId,
      gender,
      weight,
      height,
      age,
      activityLevel,
      goal,
      dailyCalories,
      nutrients
    });

    await user.save();
    res.status(201).json({ message: "Данные пользователя сохранены", dailyCalories, nutrients,proteinCoef, fatCoef });
  } catch (error) {
    res.status(500).json({ error: "Ошибка при сохранении данных" });
  }
});

app.post("/update-coefficients", async (req, res) => {
  try {
    const { userId, proteinCoef, fatCoef } = req.body;

    // Обновляем коэффициенты для пользователя в базе данных
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    const dailyCalories = user.dailyCalories;
    const weight = user.weight; // Получаем вес пользователя из базы данных
    const {protein, fat, carbs} = calculateNutrients(dailyCalories, proteinCoef, fatCoef, weight)



  

  
    await User.updateOne({ userId }, { $set: { 'nutrients': { protein, fat, carbs } } });



    // Сохраняем обновленные данные
    await user.save();

    res.status(200).json({ dailyCalories, nutrients: { protein, fat, carbs } });
  } catch (error) {
    res.status(500).json({ error: "Ошибка при обновлении коэффициентов" });
  }
});

const startServer = () => {
  app.listen(3000, () => {
    console.log("Proxy server is running on port 3000");
  });
};

module.exports = { startServer };
