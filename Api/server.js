require("dotenv").config();
const axios = require("axios");
const User = require("../DB/User");
const NutrientLog = require("../DB/NutrientLog");
const FoodHistory = require("../DB/FoodHistory");
const BarCodeProduct = require("../DB/BarCodeProduct");
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

const performResetForAllUsers = async () => {
  const users = await User.find();
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10); // "2024-04-24"

  for (const user of users) {
    const lastReset = user.lastReset || user.createdAt || today;
    const daysSince = Math.floor((today - new Date(lastReset)) / (1000 * 60 * 60 * 24));

    if (daysSince >= user.period) {
      const log = await NutrientLog.findOne({ userId: user.userId });
      console.log("🧪 NutrientLog для пользователя", user.userId, log);

      const entry = {
        total: log?.totalNutrients || { calories: 0, protein: 0, fat: 0, carbs: 0 },
        products: log?.products || [],
      };

      console.log("🟡 Записываю в UserHistory");

      await FoodHistory.updateOne(
        { userId: user.userId },
        { $set: { [`history.${todayKey}`]: entry } },
        { upsert: true }
      );

      await resetTotal(user.userId);
      user.lastReset = today;
      await user.save();

      console.log(`✅ Сброшено для ${user.userId}`);
    }
  }
};
const getLocalDateKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
app.post("/manual-reset", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const todayKey = getLocalDateKey();
    const log = await NutrientLog.findOne({ userId, date: todayKey });

    const allProducts = [
      ...(log?.meals?.Breakfast || []),
      ...(log?.meals?.Lunch || []),
      ...(log?.meals?.Dinner || []),
      ...(log?.meals?.Snacks || []),
    ];

    const entry = {
      total: log?.totalNutrients || { calories: 0, protein: 0, fat: 0, carbs: 0 },
      products: allProducts,
    };

    await FoodHistory.updateOne(
      { userId },
      { $set: { [`history.${todayKey}`]: entry } },
      { upsert: true }
    );

    await resetTotal(userId, todayKey);

    user.lastReset = new Date();
    await user.save();

    res.status(200).json({ message: "Reset done" });
  } catch (err) {
    console.error("Ошибка в /manual-reset:", err.message);
    res.status(500).json({ error: "Ошибка при сбросе" });
  }
});
app.get("/debug-reset", async (req, res) => {
  try {
    const users = await User.find();
    const today = new Date();
    const debugResults = [];

    for (const user of users) {
      const log = await NutrientLog.findOne({ userId: user.userId });

      let historyEntry = null;
      if (log) {
        historyEntry = await FoodHistory.create({
          userId: user.userId,
          date: today,
          products: log.products || [],
          total: log.totalNutrients || {},
        });
      }

      await resetTotal(user.userId);
      user.lastReset = today;
      await user.save();

      debugResults.push({
        userId: user.userId,
        productsLogged: log?.products?.length || 0,
        historySaved: !!historyEntry,
      });
    }

    res.json({
      status: "✅ Сброс выполнен",
      result: debugResults,
    });
  } catch (error) {
    console.error("❌ Ошибка в /debug-reset:", error);
    res.status(500).json({ error: error.message });
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

app.post("/add-update", async (req, res) => {
  const { nutrients, user, product, date, meal } = req.body;

  try {
  


    const result = await addAndUpdate(user, date, meal, nutrients, product);

    res.status(200).json({ message: "Nutrients updated successfully" });
  } catch (error) {
    console.error("Error updating nutrients:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/check-nutrients", async (req, res) => {
  const { user, date } = req.query;
  
  try {
    const result = await findTotal(Number(user), date);

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
  const { user, entryId, date } = req.query;

  try {
    const result = await findAndDelete(user, entryId, date);
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
  const barcode = String(req.query.barcode || "").trim();
  if (!barcode) return res.status(400).json({ error: "barcode is required" });

  const fatUrl = "https://platform.fatsecret.com/rest/food/barcode/find-by-id/v1";

  try {
    await checkAndRefreshToken();

    // 1) FatSecret
    try {
      const apiResponse = await axios.get(fatUrl, {
        params: { barcode, format: "json" },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const fatData = apiResponse.data;

      const fatFood =
        fatData?.food ||
        fatData?.foods?.food ||
        fatData?.result?.food ||
        null;

      if (fatFood) {
        return res.status(200).json({ food: fatFood, source: "fatsecret" });
      }
    } catch (err) {
      // Если не 404 — это проблема
      if (!(err.response && err.response.status === 404)) {
        console.error(
          "FatSecret error:",
          err.response ? err.response.data : err.message
        );
        return res.status(502).json({ error: "Upstream FatSecret error" });
      }
    }

    // 2) Local DB (FatSecret-like)
    const localFood = await BarCodeProduct.findOne({ barcode }).lean();
    if (localFood) {
      return res.status(200).json({ food: localFood, source: "local" });
    }

    return res.status(404).json({ message: "Продукт не найден" });
  } catch (error) {
    console.error("Error in /getByBarcode:", error.message || error);
    return res.status(500).json({ error: "Internal server error" });
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

    let proteinCoef, fatCoef;

    if (goal === "lose") {
      proteinCoef = 2.3;
      fatCoef = 0.9;
    }

    if (goal === "gain") {
      proteinCoef = 2.0;
      fatCoef = 1.1;
    }

    if (goal === "maintain") {
      proteinCoef = 1.8;
      fatCoef = 1.0;
    }

    const { protein, fat, carbs } = calculateNutrients(dailyCalories, proteinCoef, fatCoef, weight);

    const nutrients = { protein, fat, carbs };

    const user = new User({
      userId,
      gender,
      weight,
      height,
      age,
      activityLevel,
      goal,
      dailyCalories,
      nutrients,
      recommendedNutrients: nutrients, // ✅ сохраняем эталонные БЖУ
    });

    await user.save();

    res.status(201).json({
      message: "Данные пользователя сохранены",
      dailyCalories,
      nutrients,
      proteinCoef,
      fatCoef,
    });
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
app.post("/update-period", async (req, res) => {
  try {
    const { userId, period } = req.body;

    if (![1, 3, 7].includes(period)) {
      return res.status(400).json({ error: "Недопустимый период" });
    }

    const user = await User.findOneAndUpdate(
      { userId },
      { period: period },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    res.json({ message: "Период обновлён", period: user.prtiod });
  } catch (error) {
    res.status(500).json({ error: "Ошибка при обновлении периода" });
  }
});

app.get("/limits", async (req, res) => {
  try {
    const { user } = req.query;

    const foundUser = await User.findOne({ userId: user });
    if (!foundUser) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const period = foundUser.period || 1;

    const { nutrients, dailyCalories} = foundUser;
    const scaledNutrients = {
  
      protein: nutrients.protein * period,
      fat: nutrients.fat * period,
      carbs: nutrients.carbs * period,
      dailyCalories: dailyCalories * period,
    };

    res.json(scaledNutrients);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при получении лимитов" });
  }
});

app.post('/update-limits', async (req, res) => {
  try {
    const { userId,nutrients} = req.body;
    const { protein, fat, carbs } = nutrients;
    const dailyCalories = protein * 4 + fat * 9 + carbs * 4; // Пример расчета калорийности

    // Обновляем лимиты для пользователя в базе данных
    const user = await User.findOneAndUpdate(
      { userId },
      {
        nutrients: nutrients,
        dailyCalories: dailyCalories,
      },
      { new: true }
    )
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    res.json({ message: "Nutrienst has been changed", nutrients:user.nutrients});
  }
catch (error) {
  console.log(error.message)
    res.status(500).json({ error: "Ошибка при обновлении лимитов" });
  }})

  app.post("/restore-nutrients", async (req, res) => {
    try {
      const { userId } = req.body;
  
      const user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }
  
      if (!user.recommendedNutrients) {
        return res.status(400).json({ error: "Нет рекомендованных значений для восстановления" });

      }

      const{protein, fat, carbs} = user.recommendedNutrients
      const dailyCalories = protein * 4 + fat * 9 + carbs * 4; // Пример расчета калорийности
  
      user.nutrients = user.recommendedNutrients;
      user.dailyCalories = dailyCalories; // Обновляем калории
      await user.save();
  
      res.status(200).json({
        message: "Значения БЖУ восстановлены",
        nutrients: user.nutrients,
      });
    } catch (error) {
      console.error("Ошибка при восстановлении БЖУ:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });

  app.get("/history", async (req, res) => {
    const { userId } = req.query;
  
    if (!userId) {
      return res.status(400).json({ error: "Не указан userId" });
    }
  
    try {
      const foodHistory = await FoodHistory.findOne({ userId });
  
      if (!foodHistory || !foodHistory.history) {
        return res.status(200).json({ history: [] });
      }
  
      const now = new Date();
      const last7Days = [];
  
      for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const dateKey = getLocalDateKey(date);
  
        const entry = foodHistory.history.get
          ? foodHistory.history.get(dateKey)
          : foodHistory.history[dateKey];
  
        if (entry) {
          last7Days.push({
            date: dateKey,
            ...entry,
          });
        }
      }
  
      res.status(200).json({ history: last7Days });
    } catch (error) {
      console.error("Ошибка при получении истории:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });
  app.post('/add-custom', async (req, res) => {
    const { userId, product } = req.body;
  
    try {
      const user = await User.findOne({ userId });
      if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  
      user.customProducts.push({
        ...product,
        createdAt: new Date(),
      });
  
      await user.save();
  
      res.status(201).json({ message: "Продукт добавлен" });
    } catch (error) {
      console.error("Ошибка при добавлении кастомного продукта:", error.message);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });
  
  
  app.get('/custom-products', async(req, res)=>{
    const {userId } = req.query;
    try {
      const user = await User.findOne({ userId });
      if (!user) return res.status(404).json({ error: "Пользователь не найден" });
      const products  = user.customProducts;
      res.status(200).json({ products });
  }
  catch(erroe) {
    console.error("Ошибка при получении кастомных продуктов:", error.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }}
)

app.delete('/delete-custom', async (req, res) => {
  const { userId, productId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });   
    user.customProducts = user.customProducts.filter(product => product._id.toString() !== productId);
    await user.save();
    res.status(200).json({ message: "Кастомный продукт удалён" });
  } catch (error) {
    console.error("Ошибка при удалении кастомного продукта:", error.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
}
);

app.post("/add-barcode-product", async (req, res) => {
  try {
    const { barcode, food_name, serving } = req.body;

    if (!barcode || !food_name || !serving) {
      return res.status(400).json({
        error: "barcode, food_name, serving are required",
      });
    }

    const cleanBarcode = String(barcode).trim();

    const doc = {
      barcode: cleanBarcode,
      source: "local",
      food_id: `local:${cleanBarcode}`,
      food_name: String(food_name).trim(),
      servings: {
        serving: [
          {
            serving_id: "local-100",
            serving_description:
              serving.serving_description ||
              `100 ${serving.metric_serving_unit || "g"}`,
            metric_serving_amount: String(serving.metric_serving_amount || "100"),
            metric_serving_unit: String(serving.metric_serving_unit || "g"),
            number_of_units: String(serving.number_of_units || "0.000"),
            calories: Number(serving.calories),
            protein: Number(serving.protein),
            fat: Number(serving.fat),
            carbohydrate: Number(serving.carbohydrate),
          },
        ],
      },
    };

    // ✅ upsert: если уже есть — обновим (на всякий)
    const saved = await BarCodeProduct.findOneAndUpdate(
      { barcode: cleanBarcode },
      { $set: doc },
      { new: true, upsert: true }
    );

    return res.status(201).json({ message: "Продукт сохранён", food: saved });
  } catch (error) {
    console.error("Ошибка при добавлении продукта с штрихкодом:", error.message);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});


const startServer = () => {
  app.listen(3000, () => {
    console.log("Proxy server is running on port 3000");
  });
};

module.exports = { startServer };
