const axios = require("axios");
const { startServer } = require("./Api/server");

startServer();

async function getToken() {
  try {
    const response = await axios.post("http://localhost:3000/get-token");

    return response.data.access_token;
  } catch (error) {
    console.error("Error getting token:", error.message);
  }
}

async function searchFood(query) {
  const token = await getToken();
  if (token) {
    try {
      const response = await axios.get("http://localhost:3000/food-search", {
        params: { query },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      console.log("Food Search Results:", response.data.foods.food);
    } catch (error) {
      console.error("Error searching for food:", error.message);
    }
  }
}

searchFood("milk");
