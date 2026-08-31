const { DEFAULT_MARGIN_QUERY } = require('./src/database/queries');
const { createPool, testDbConnection, fetchMarginMinusData } = require('./src/database/connection');

module.exports = {
  DEFAULT_MARGIN_QUERY,
  createPool,
  testDbConnection,
  fetchMarginMinusData
};
