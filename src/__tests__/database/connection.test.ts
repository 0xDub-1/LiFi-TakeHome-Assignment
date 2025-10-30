/**
 * Database Connection Tests
 * 
 * Tests the MongoDB connection and basic model operations
 */

import { connectToDatabase, closeDatabaseConnection } from '../../database/connection'
import { FeeCollectedEventModel, ScanProgressModel } from '../../models'

describe('Database Connection', () => {
  // Connect before all tests
  beforeAll(async () => {
    await connectToDatabase()
  })

  // Close connection after all tests
  afterAll(async () => {
    await closeDatabaseConnection()
  })

  // Clean up test data after each test
  afterEach(async () => {
    await ScanProgressModel.deleteMany({ chain: 'test-chain' })
    await FeeCollectedEventModel.deleteMany({ chain: 'test-chain' })
  })

  describe('Connection', () => {
    it('should connect to MongoDB successfully', async () => {
      // If we got here, the connection worked (beforeAll succeeded)
      expect(true).toBe(true)
    })
  })

  describe('ScanProgress Model', () => {
    it('should create a ScanProgress document', async () => {
      const scanProgress = await ScanProgressModel.create({
        chain: 'test-chain',
        lastScannedBlock: 100000,
        lastScanTimestamp: new Date(),
        status: 'idle',
      })

      expect(scanProgress).toBeDefined()
      expect(scanProgress.chain).toBe('test-chain')
      expect(scanProgress.lastScannedBlock).toBe(100000)
      expect(scanProgress.status).toBe('idle')
    })

    it('should read a ScanProgress document', async () => {
      // Create
      await ScanProgressModel.create({
        chain: 'test-chain',
        lastScannedBlock: 100000,
        lastScanTimestamp: new Date(),
        status: 'idle',
      })

      // Read
      const found = await ScanProgressModel.findOne({ chain: 'test-chain' })

      expect(found).toBeDefined()
      expect(found?.chain).toBe('test-chain')
      expect(found?.lastScannedBlock).toBe(100000)
    })

    it('should update a ScanProgress document', async () => {
      // Create
      await ScanProgressModel.create({
        chain: 'test-chain',
        lastScannedBlock: 100000,
        lastScanTimestamp: new Date(),
        status: 'idle',
      })

      // Update
      await ScanProgressModel.updateOne(
        { chain: 'test-chain' },
        { lastScannedBlock: 200000, status: 'scanning' }
      )

      // Verify
      const updated = await ScanProgressModel.findOne({ chain: 'test-chain' })
      expect(updated?.lastScannedBlock).toBe(200000)
      expect(updated?.status).toBe('scanning')
    })

    it('should enforce unique constraint on chain', async () => {
      // Create first document
      await ScanProgressModel.create({
        chain: 'test-chain',
        lastScannedBlock: 100000,
        lastScanTimestamp: new Date(),
        status: 'idle',
      })

      // Try to create duplicate - should fail
      await expect(
        ScanProgressModel.create({
          chain: 'test-chain',
          lastScannedBlock: 200000,
          lastScanTimestamp: new Date(),
          status: 'idle',
        })
      ).rejects.toThrow()
    })

    it('should validate status enum', async () => {
      // Try to create with invalid status
      await expect(
        ScanProgressModel.create({
          chain: 'test-chain',
          lastScannedBlock: 100000,
          lastScanTimestamp: new Date(),
          status: 'invalid-status' as any,
        })
      ).rejects.toThrow()
    })
  })

  describe('FeeCollectedEvent Model', () => {
    it('should create a FeeCollectedEvent document', async () => {
      const event = await FeeCollectedEventModel.create({
        chain: 'test-chain',
        token: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        integrator: '0x1234567890ABCDEF1234567890ABCDEF12345678',
        integratorFee: '1000000000000000000',
        lifiFee: '500000000000000000',
        blockNumber: 100001,
        transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        logIndex: 0,
        blockTimestamp: new Date(),
      })

      expect(event).toBeDefined()
      expect(event.chain).toBe('test-chain')
      expect(event.blockNumber).toBe(100001)
      expect(event.integratorFee).toBe('1000000000000000000')
    })

    it('should convert addresses to lowercase', async () => {
      const event = await FeeCollectedEventModel.create({
        chain: 'test-chain',
        token: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        integrator: '0x1234567890ABCDEF1234567890ABCDEF12345678',
        integratorFee: '1000000000000000000',
        lifiFee: '500000000000000000',
        blockNumber: 100001,
        transactionHash: '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333444455556666777788889999',
        logIndex: 0,
        blockTimestamp: new Date(),
      })

      // Addresses should be lowercase
      expect(event.token).toBe('0xabcdef1234567890abcdef1234567890abcdef12')
      expect(event.integrator).toBe('0x1234567890abcdef1234567890abcdef12345678')
      expect(event.transactionHash).toBe('0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999')
    })

    it('should enforce unique constraint on transactionHash + logIndex', async () => {
      // Create first event
      await FeeCollectedEventModel.create({
        chain: 'test-chain',
        token: '0xabcdef1234567890abcdef1234567890abcdef12',
        integrator: '0x1234567890abcdef1234567890abcdef12345678',
        integratorFee: '1000000000000000000',
        lifiFee: '500000000000000000',
        blockNumber: 100001,
        transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        logIndex: 0,
        blockTimestamp: new Date(),
      })

      // Try to create duplicate - should fail
      await expect(
        FeeCollectedEventModel.create({
          chain: 'test-chain',
          token: '0xabcdef1234567890abcdef1234567890abcdef12',
          integrator: '0x1234567890abcdef1234567890abcdef12345678',
          integratorFee: '2000000000000000000',
          lifiFee: '1000000000000000000',
          blockNumber: 100001,
          transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
          logIndex: 0,
          blockTimestamp: new Date(),
        })
      ).rejects.toThrow()
    })

    it('should find events by integrator', async () => {
      const integrator = '0x1234567890abcdef1234567890abcdef12345678'

      // Create multiple events
      await FeeCollectedEventModel.create({
        chain: 'test-chain',
        token: '0xabcdef1234567890abcdef1234567890abcdef12',
        integrator,
        integratorFee: '1000000000000000000',
        lifiFee: '500000000000000000',
        blockNumber: 100001,
        transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        logIndex: 0,
        blockTimestamp: new Date(),
      })

      await FeeCollectedEventModel.create({
        chain: 'test-chain',
        token: '0xabcdef1234567890abcdef1234567890abcdef12',
        integrator,
        integratorFee: '2000000000000000000',
        lifiFee: '1000000000000000000',
        blockNumber: 100002,
        transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
        logIndex: 0,
        blockTimestamp: new Date(),
      })

      // Find by integrator
      const events = await FeeCollectedEventModel.find({ 
        chain: 'test-chain',
        integrator 
      })

      expect(events).toHaveLength(2)
      expect(events[0].integrator).toBe(integrator)
      expect(events[1].integrator).toBe(integrator)
    })
  })

  describe('Indexes', () => {
    it('should have created indexes for ScanProgress', async () => {
      const indexes = await ScanProgressModel.collection.getIndexes()
      
      expect(indexes).toHaveProperty('_id_')
      expect(indexes).toHaveProperty('chain_1')
    })

    it('should have created indexes for FeeCollectedEvent', async () => {
      const indexes = await FeeCollectedEventModel.collection.getIndexes()
      
      expect(indexes).toHaveProperty('_id_')
      expect(indexes).toHaveProperty('integrator_1')
      expect(indexes).toHaveProperty('blockNumber_1')
    })
  })
})

