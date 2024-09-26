const { getFood } = require("./Api/api");

const getData = async () => {
  await getFood("milk");
};

getData();
