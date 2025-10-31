import mongoose from 'mongoose'
import { setupTestDatabase, clearTestDatabase, teardownTestDatabase } from '../helpers/db.helper'

describe('Database Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  afterEach(async () => {
    await clearTestDatabase()
  })

  it('should connect to test database', () => {
    expect(mongoose.connection.readyState).toBe(1) // Connected
  })

  it('should have database name', () => {
    expect(mongoose.connection.name).toBeTruthy()
  })

  it('should be able to create collections', async () => {
    const testCollection = mongoose.connection.collection('test')
    await testCollection.insertOne({ test: 'data' })

    const count = await testCollection.countDocuments()
    expect(count).toBe(1)
  })

  it('should clear database between tests', async () => {
    const testCollection = mongoose.connection.collection('test')
    await testCollection.insertOne({ test: 'data' })

    await clearTestDatabase()

    const count = await testCollection.countDocuments()
    expect(count).toBe(0)
  })
})

