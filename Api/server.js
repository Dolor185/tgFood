require("dotenv").config();
const axios = require("axios");
const qs = require("qs");
const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());

const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

let accessToken = "";
let tokenExpiration = 0;

app.post("/get-token", async (req, res) => {
  try {
    const tokenResponse = await axios.post(
      "https://oauth.fatsecret.com/connect/token",
      qs.stringify({
        grant_type: "client_credentials",
        scope: "premier", // Проверьте, что это тот scope, который вам нужен
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
          scope: "premier",
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
      console.error("Error refreshing token:", error.message);
      throw new Error("Failed to refresh access token");
    }
  }
};

// Поиск продуктов
app.get("/food-search", async (req, res) => {
  const { query, page } = req.query;

  try {
    // Проверяем и обновляем токен при необходимости
    await checkAndRefreshToken();

    // Выполняем запрос к FatSecret API
    const apiResponse = await axios.get(
      `https://platform.fatsecret.com/rest/foods/search/v1`,

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

const startServer = () => {
  app.listen(3000, () => {
    console.log("Proxy server is running on port 3000");
  });
};

module.exports = { startServer };
