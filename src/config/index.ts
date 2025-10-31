import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

/**
 * Application configuration loaded from environment variables
 * All configuration is centralized here for easy maintenance and testing
 */
export const config = {
  // MongoDB configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lifi-fee-collector',
  },

  // Blockchain configuration
  blockchain: {
    chain: process.env.CHAIN_NAME || 'polygon',
    rpcUrl: process.env.RPC_URL || process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    feeCollectorAddress:
      process.env.FEE_COLLECTOR_CONTRACT_ADDRESS ||
      '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    oldestBlock: parseInt(process.env.OLDEST_BLOCK || '77000000', 10),
  },

  // Scanner configuration
  scanner: {
    intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '60000', 10),
    blocksPerBatch: parseInt(process.env.BLOCKS_PER_BATCH || '10000', 10),
  },

  // API configuration
  api: {
    port: parseInt(process.env.API_PORT || '3000', 10),
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
}

/**
 * Validates that all required configuration values are present
 * @throws Error if any required configuration is missing
 */
export function validateConfig(): void {
  const required = [
    { key: 'MONGODB_URI', value: config.mongodb.uri },
    { key: 'RPC_URL or POLYGON_RPC_URL', value: config.blockchain.rpcUrl },
    { key: 'FEE_COLLECTOR_CONTRACT_ADDRESS', value: config.blockchain.feeCollectorAddress },
    { key: 'CHAIN_NAME', value: config.blockchain.chain },
  ]

  const missing = required.filter(({ value }) => !value)

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.map(({ key }) => key).join(', ')}`
    )
  }
}

