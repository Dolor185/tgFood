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
        scope: "basic",
      }), // Преобразуем параметры для x-www-form-urlencoded
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

    accessToken = tokenResponse.data.access_token; // Сохраняем токен
    tokenExpiration = Date.now() + tokenResponse.data.expires_in * 1000; // Устанавливаем время истечения

    res.json(tokenResponse.data);
  } catch (error) {
    console.error(
      "Error getting token:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: error.message });
  }
});

app.get("/food-search", async (req, res) => {
  const { query } = req.query;

  // Проверяем, не истек ли токен
  if (!accessToken || Date.now() > tokenExpiration) {
    return res.status(401).json({ error: "Access token expired or not set." });
  }

  try {
    const apiResponse = await axios.get(
      `https://platform.fatsecret.com/rest/foods/search/v1`,
      {
        params: {
          search_expression: query,
          format: "json", // Указываем, что формат ответа должен быть JSON
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
