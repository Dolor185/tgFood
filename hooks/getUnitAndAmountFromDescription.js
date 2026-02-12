const getUnitAndAmountFromDescription = (description) => {
  const match = description.match(/Per\s+([\d.]+)\s*(\w+\s*\w*)/);
  if (match) {
    return {
      amount: parseFloat(match[1]),
      unit: match[2], 
    };
  }
  return { amount: 100, unit: "g" }; 
};

module.exports = getUnitAndAmountFromDescription;
