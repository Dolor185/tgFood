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

module.exports = getUnitAndAmountFromDescription;
