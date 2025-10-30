import mongoose from 'mongoose'
import { config } from '../config'
import { logger } from '../utils/logger'

/**
 * Establishes connection to MongoDB database
 * Handles connection events and errors
 *
 * @returns Promise that resolves when connection is established
 * @throws Error if connection fails
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  try {
    logger.info('Connecting to MongoDB...', { uri: config.mongodb.uri })

    const connection = await mongoose.connect(config.mongodb.uri)

    // Connection event handlers
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected successfully')
    })

    mongoose.connection.on('error', err => {
      logger.error('MongoDB connection error:', err)
    })

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected')
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close()
      logger.info('MongoDB connection closed due to app termination')
      process.exit(0)
    })

    return connection
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error)
    throw error
  }
}

/**
 * Closes the database connection
 * Useful for testing and graceful shutdown
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await mongoose.connection.close()
    logger.info('MongoDB connection closed')
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error)
    throw error
  }
}

