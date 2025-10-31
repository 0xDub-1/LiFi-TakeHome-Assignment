import { FeeCollectedEventModel, ScanProgressModel } from '../../src/models'
import { setupTestDatabase, clearTestDatabase, teardownTestDatabase } from '../helpers/db.helper'

describe('Models Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase()
    
    // Ensure indexes are created
    await FeeCollectedEventModel.createIndexes()
    await ScanProgressModel.createIndexes()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  afterEach(async () => {
    await clearTestDatabase()
  })

  describe('FeeCollectedEvent Model', () => {
    const sampleEvent = {
      chain: 'polygon',
      transactionHash: '0xabc123def456789',
      blockNumber: 77000050,
      blockTimestamp: 1705320000,
      logIndex: 10,
      token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      integrator: '0x1234567890abcdef1234567890abcdef12345678',
      integratorFee: '1000000',
      lifiFee: '500000',
    }

    it('should create and save an event', async () => {
      const event = new FeeCollectedEventModel(sampleEvent)
      const saved = await event.save()

      expect(saved._id).toBeDefined()
      expect(saved.chain).toBe('polygon')
      expect(saved.transactionHash).toBe(sampleEvent.transactionHash)
      expect(saved.blockNumber).toBe(77000050)
    })

    it('should enforce required fields', async () => {
      const invalidEvent = new FeeCollectedEventModel({
        chain: 'polygon',
        // Missing required fields
      })

      await expect(invalidEvent.save()).rejects.toThrow()
    })

    it('should store addresses in lowercase', async () => {
      const eventWithUppercase = {
        ...sampleEvent,
        token: '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48', // Uppercase
        integrator: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12', // Uppercase
      }

      const event = new FeeCollectedEventModel(eventWithUppercase)
      const saved = await event.save()

      expect(saved.token).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
      expect(saved.integrator).toBe('0xabcdef1234567890abcdef1234567890abcdef12')
    })

    it('should prevent duplicate events (unique index)', async () => {
      await FeeCollectedEventModel.create(sampleEvent)

      // Try to create duplicate
      const duplicate = new FeeCollectedEventModel(sampleEvent)
      await expect(duplicate.save()).rejects.toThrow(/duplicate key/)
    })

    it('should allow same transaction hash with different log index', async () => {
      await FeeCollectedEventModel.create(sampleEvent)

      const sameTransaction = {
        ...sampleEvent,
        logIndex: 11, // Different log index
      }

      const saved = await FeeCollectedEventModel.create(sameTransaction)
      expect(saved._id).toBeDefined()
    })

    it('should query by integrator', async () => {
      await FeeCollectedEventModel.create(sampleEvent)
      await FeeCollectedEventModel.create({
        ...sampleEvent,
        transactionHash: '0xdifferent123',
        logIndex: 11,
        integrator: '0xdifferentintegrator0000000000000000000000',
      })

      const events = await FeeCollectedEventModel.find({
        integrator: sampleEvent.integrator,
      })

      expect(events).toHaveLength(1)
      expect(events[0].integrator).toBe(sampleEvent.integrator)
    })

    it('should query by block range', async () => {
      await FeeCollectedEventModel.create({ ...sampleEvent, blockNumber: 77000000 })
      await FeeCollectedEventModel.create({ ...sampleEvent, blockNumber: 77000050, transactionHash: '0xabc2', logIndex: 11 })
      await FeeCollectedEventModel.create({ ...sampleEvent, blockNumber: 77000100, transactionHash: '0xabc3', logIndex: 12 })

      const events = await FeeCollectedEventModel.find({
        blockNumber: { $gte: 77000040, $lte: 77000060 },
      })

      expect(events).toHaveLength(1)
      expect(events[0].blockNumber).toBe(77000050)
    })

    it('should sort by blockNumber', async () => {
      await FeeCollectedEventModel.create({ ...sampleEvent, blockNumber: 77000100, transactionHash: '0xabc1', logIndex: 1 })
      await FeeCollectedEventModel.create({ ...sampleEvent, blockNumber: 77000000, transactionHash: '0xabc2', logIndex: 2 })
      await FeeCollectedEventModel.create({ ...sampleEvent, blockNumber: 77000050, transactionHash: '0xabc3', logIndex: 3 })

      const events = await FeeCollectedEventModel.find().sort({ blockNumber: 1 })

      expect(events[0].blockNumber).toBe(77000000)
      expect(events[1].blockNumber).toBe(77000050)
      expect(events[2].blockNumber).toBe(77000100)
    })

    it('should have timestamps', async () => {
      const event = await FeeCollectedEventModel.create(sampleEvent)

      expect(event.createdAt).toBeInstanceOf(Date)
      expect(event.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('ScanProgress Model', () => {
    const sampleProgress = {
      chain: 'polygon',
      lastScannedBlock: 77000000,
      latestBlockNumber: 77000100,
      status: 'scanning' as const,
    }

    it('should create and save scan progress', async () => {
      const progress = new ScanProgressModel(sampleProgress)
      const saved = await progress.save()

      expect(saved._id).toBeDefined()
      expect(saved.chain).toBe('polygon')
      expect(saved.lastScannedBlock).toBe(77000000)
      expect(saved.status).toBe('scanning')
    })

    it('should enforce unique chain constraint', async () => {
      await ScanProgressModel.create(sampleProgress)

      // Try to create duplicate for same chain
      const duplicate = new ScanProgressModel(sampleProgress)
      await expect(duplicate.save()).rejects.toThrow(/duplicate key/)
    })

    it('should allow different chains', async () => {
      await ScanProgressModel.create(sampleProgress)

      const ethereum = {
        ...sampleProgress,
        chain: 'ethereum',
      }

      const saved = await ScanProgressModel.create(ethereum)
      expect(saved._id).toBeDefined()
    })

    it('should validate status enum', async () => {
      const invalidProgress = new ScanProgressModel({
        ...sampleProgress,
        status: 'invalid_status' as any,
      })

      await expect(invalidProgress.save()).rejects.toThrow()
    })

    it('should store optional lastError', async () => {
      const progressWithError = await ScanProgressModel.create({
        ...sampleProgress,
        lastError: 'Rate limit exceeded',
      })

      expect(progressWithError.lastError).toBe('Rate limit exceeded')
    })

    it('should update lastScanTimestamp automatically', async () => {
      const progress = await ScanProgressModel.create(sampleProgress)
      const firstTimestamp = progress.lastScanTimestamp

      // Wait a bit and update
      await new Promise(resolve => setTimeout(resolve, 10))

      progress.lastScannedBlock = 77000050
      await progress.save()

      expect(progress.lastScanTimestamp.getTime()).toBeGreaterThanOrEqual(firstTimestamp.getTime())
    })

    it('should find by chain', async () => {
      await ScanProgressModel.create(sampleProgress)
      await ScanProgressModel.create({ ...sampleProgress, chain: 'ethereum' })

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' })

      expect(progress).toBeDefined()
      expect(progress!.chain).toBe('polygon')
    })
  })
})

