/**
 * SGX Margin Trading Cost Calculator
 * Implements the specific formulas for calculating total trading costs for margin positions on SGX
 */

/**
 * Calculate SGX margin trading costs
 * @param {Object} params - Calculation parameters
 * @param {number} params.tradeValue - Trade value in SGD (e.g., 1000)
 * @param {number} params.marginRatio - Margin ratio as decimal (e.g., 0.5 for 50%)
 * @param {number} params.holdingDays - Number of days holding the position
 * @param {number} params.marginInterestRate - Annual margin interest rate (default: 0.06 for 6%)
 * @param {number} params.feeRate - Broker fee rate applied per leg (default: 0.00127 i.e. 0.127%)
 * @param {number} params.minimumFee - Minimum broker fee per leg in SGD (default: 4.10)
 * @returns {Object} Calculated costs and details
 */
export const calculateSGXMarginCosts = ({
  tradeValue,
  marginRatio,
  holdingDays,
  marginInterestRate = 0.06,
  feeRate = 0.00127,
  minimumFee = 4.10
}) => {
  // Validate inputs
  if (!tradeValue || tradeValue <= 0) {
    throw new Error('Trade value must be greater than 0');
  }
  
  if (!marginRatio || marginRatio < 0 || marginRatio > 1) {
    throw new Error('Margin ratio must be between 0 and 1');
  }
  
  const normalizedHoldingDays = Number(holdingDays);
  if (!Number.isFinite(normalizedHoldingDays) || normalizedHoldingDays < 0) {
    throw new Error('Holding days must be greater than or equal to 0');
  }
  
  // Calculate broker fees with minimum per leg
  const computedFee = tradeValue * feeRate;
  const openFee = Math.max(minimumFee, computedFee);
  const closeFee = Math.max(minimumFee, computedFee);
  
  // Apply the SGX margin formulas
  const borrowed = tradeValue * marginRatio;
  const dailyInterest = (borrowed * marginInterestRate) / 365;
  const financingCost = dailyInterest * normalizedHoldingDays;
  const totalFees = openFee + closeFee;
  const totalCost = totalFees + financingCost;
  
  // Calculate cost as percentage of trade value
  const totalCostPercentage = (totalCost / tradeValue) * 100;
  
  return {
    tradeValue: parseFloat(tradeValue?.toFixed(2)),
    marginRatio: parseFloat(marginRatio?.toFixed(4)),
    borrowed: parseFloat(borrowed?.toFixed(2)),
    holdingDays: parseInt(normalizedHoldingDays),
    dailyInterest: parseFloat(dailyInterest?.toFixed(4)),
    financingCost: parseFloat(financingCost?.toFixed(2)),
    openFees: parseFloat(openFee?.toFixed(2)),
    closeFees: parseFloat(closeFee?.toFixed(2)),
    totalCost: parseFloat(totalCost?.toFixed(2)),
    totalCostPercentage: parseFloat(totalCostPercentage?.toFixed(4)),
    
    // Additional breakdown for transparency
    breakdown: {
      openFees: parseFloat(openFee?.toFixed(2)),
      closeFees: parseFloat(closeFee?.toFixed(2)),
      marginInterest: parseFloat(financingCost?.toFixed(2)),
      totalFees: parseFloat(totalFees?.toFixed(2)),
      totalInterest: parseFloat(financingCost?.toFixed(2))
    }
  };
};

/**
 * Calculate margin costs for multiple holding periods
 * @param {Object} params - Base calculation parameters
 * @param {Array<number>} holdingPeriods - Array of holding days to calculate
 * @returns {Array} Array of calculation results for each holding period
 */
export const calculateMultiplePeriods = (params, holdingPeriods = [1, 7, 14, 30, 60, 90]) => {
  return holdingPeriods?.map(days => ({
    holdingDays: days,
    ...calculateSGXMarginCosts({ ...params, holdingDays: days })
  }));
};

/**
 * Format currency for SGD display
 * @param {number} amount - Amount in SGD
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted currency string
 */
export const formatSGD = (amount, decimals = 2) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'SGD 0.00';
  }
  return `SGD ${parseFloat(amount)?.toFixed(decimals)}`;
};

/**
 * Format percentage display
 * @param {number} percentage - Percentage value
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (percentage, decimals = 2) => {
  if (percentage === null || percentage === undefined || isNaN(percentage)) {
    return '0.00%';
  }
  return `${parseFloat(percentage)?.toFixed(decimals)}%`;
};

/**
 * Example calculation based on user's provided example
 * Trade value: 1000 SGD, Margin ratio: 0.5, Holding days: 1
 * Expected result: ~8.28 SGD total cost
 */
export const getExampleCalculation = () => {
  return calculateSGXMarginCosts({
    tradeValue: 1000,
    marginRatio: 0.5,
    holdingDays: 1
  });
};

/**
 * Validate and sanitize input parameters
 * @param {Object} inputs - Raw input parameters
 * @returns {Object} Validated and sanitized parameters
 */
export const validateInputs = (inputs) => {
  const {
    tradeValue,
    marginRatio,
    holdingDays,
    marginInterestRate = 0.06,
    feeRate = 0.00127,
    minimumFee = 4.10
  } = inputs;

  const errors = {};

  // Validate trade value
  const parsedTradeValue = parseFloat(tradeValue);
  if (isNaN(parsedTradeValue) || parsedTradeValue <= 0) {
    errors.tradeValue = 'Trade value must be a positive number';
  }

  // Validate margin ratio
  const parsedMarginRatio = parseFloat(marginRatio);
  if (isNaN(parsedMarginRatio) || parsedMarginRatio < 0 || parsedMarginRatio > 1) {
    errors.marginRatio = 'Margin ratio must be between 0 and 1';
  }

  // Validate holding days
  const parsedHoldingDays = parseInt(holdingDays);
  if (isNaN(parsedHoldingDays) || parsedHoldingDays < 0) {
    errors.holdingDays = 'Holding days must be a non-negative integer';
  }

  // Validate margin interest rate
  const parsedInterestRate = parseFloat(marginInterestRate);
  if (isNaN(parsedInterestRate) || parsedInterestRate < 0) {
    errors.marginInterestRate = 'Margin interest rate must be non-negative';
  }

  const parsedFeeRate = parseFloat(feeRate);
  if (isNaN(parsedFeeRate) || parsedFeeRate < 0) {
    errors.feeRate = 'Fee rate must be a non-negative number';
  }

  const parsedMinimumFee = parseFloat(minimumFee);
  if (isNaN(parsedMinimumFee) || parsedMinimumFee < 0) {
    errors.minimumFee = 'Minimum fee must be a non-negative number';
  }

  return {
    isValid: Object.keys(errors)?.length === 0,
    errors,
    sanitized: {
      tradeValue: parsedTradeValue,
      marginRatio: parsedMarginRatio,
      holdingDays: parsedHoldingDays,
      marginInterestRate: parsedInterestRate,
      feeRate: parsedFeeRate,
      minimumFee: parsedMinimumFee
    }
  };
};
