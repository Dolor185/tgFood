require("dotenv").config();
const axios = require("axios");

const express = require("express");
const app = express();

const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

app.post("/get-token", async (req, res) => {
  try {
    const tokenResponse = await axios.post(
      "https://oauth.fatsecret.com/connect/token",
      null,
      {
        auth: {
          username: apiKey,
          password: apiSecret,
        },
        params: {
          grant_type: "client_credentials",
          scope: "basic",
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    res.json(tokenResponse.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
const getFood = app.get("/food-search", async (req, res) => {
  const { query } = req.query;
  const token = "YOUR_ACCESS_TOKEN"; // Токен можно получать и обновлять на сервере

  try {
    const apiResponse = await axios.get(
      `https://platform.fatsecret.com/rest/foods/search/v3`,
      {
        params: { search_expression: query },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );
    res.json(apiResponse.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Proxy server is running on port 3000");
});

module.exports = {
  getFood,
};
