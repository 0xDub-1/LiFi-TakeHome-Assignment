import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongoServer: MongoMemoryServer | null = null

/**
 * Setup in-memory MongoDB for testing
 */
export async function setupTestDatabase(): Promise<void> {
  // Close any existing connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  // Create new in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create()
  const mongoUri = mongoServer.getUri()

  await mongoose.connect(mongoUri)
}

/**
 * Clear all data from database
 */
export async function clearTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    return
  }

  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
}

/**
 * Teardown database connection
 */
export async function teardownTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  if (mongoServer) {
    await mongoServer.stop()
    mongoServer = null
  }
}

