import { EventScannerService } from '../../src/services/eventScanner.service'
import { BlockchainService, ParsedFeeCollectedEvent } from '../../src/services/blockchain.service'
import { FeeCollectedEventModel, ScanProgressModel } from '../../src/models'
import { setupTestDatabase, clearTestDatabase, teardownTestDatabase } from '../helpers/db.helper'
import { ethers } from 'ethers'

// Mock BlockchainService
jest.mock('../../src/services/blockchain.service')

describe('Event Scanner E2E Tests', () => {
  let blockchainService: jest.Mocked<BlockchainService>
  let eventScanner: EventScannerService

  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  afterEach(async () => {
    await clearTestDatabase()
    jest.clearAllMocks()
  })

  beforeEach(() => {
    // Create mock blockchain service
    blockchainService = {
      getCurrentBlockNumber: jest.fn(),
      fetchAndParseEvents: jest.fn(),
      validateConnection: jest.fn(),
    } as any

    // Create scanner service
    eventScanner = new EventScannerService(
      blockchainService,
      'polygon',
      77000000, // oldestBlock
      100 // blocksPerBatch
    )
  })

  describe('Initial Scan', () => {
    it('should initialize scan progress on first run', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(77000100)
      blockchainService.fetchAndParseEvents.mockResolvedValue([])

      await eventScanner.scan()

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' })

      expect(progress).toBeDefined()
      expect(progress!.lastScannedBlock).toBeGreaterThanOrEqual(77000000)
      expect(progress!.latestBlockNumber).toBe(77000100)
    })

    it('should not overwrite existing progress', async () => {
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 77000050,
        latestBlockNumber: 77000100,
        status: 'scanning',
      })

      blockchainService.getCurrentBlockNumber.mockResolvedValue(77000100)
      blockchainService.fetchAndParseEvents.mockResolvedValue([])

      await eventScanner.scan()

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' })

      expect(progress!.lastScannedBlock).toBeGreaterThanOrEqual(77000050) // Moved forward or stayed
    })
  })

  describe('Scan Cycle', () => {
    beforeEach(async () => {
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 77000000,
        latestBlockNumber: 77000100,
        status: 'idle',
      })
    })

    it('should scan and store events', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(77000100)
      
      const mockEvents: ParsedFeeCollectedEvent[] = [
        {
          transactionHash: '0xabc123',
          blockNumber: 77000050,
          blockTimestamp: new Date(1705320000 * 1000),
          logIndex: 10,
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          integrator: '0x1234567890abcdef1234567890abcdef12345678',
          integratorFee: ethers.BigNumber.from('1000000'),
          lifiFee: ethers.BigNumber.from('500000'),
        },
        {
          transactionHash: '0xdef456',
          blockNumber: 77000051,
          blockTimestamp: new Date(1705320002 * 1000),
          logIndex: 5,
          token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
          integrator: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          integratorFee: ethers.BigNumber.from('2000000'),
          lifiFee: ethers.BigNumber.from('750000'),
        },
      ]
      
      blockchainService.fetchAndParseEvents.mockResolvedValue(mockEvents)

      const result = await eventScanner.scan()

      expect(result.scannedBlocks).toBe(100)
      expect(result.newEvents).toBe(2)

      // Check events were stored
      const events = await FeeCollectedEventModel.find()
      expect(events).toHaveLength(2)

      // Check progress was updated
      const progress = await ScanProgressModel.findOne({ chain: 'polygon' })
      expect(progress!.lastScannedBlock).toBe(77000100)
    })

    it('should handle empty scan (no events)', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(77000100)
      blockchainService.fetchAndParseEvents.mockResolvedValue([])

      const result = await eventScanner.scan()

      expect(result.scannedBlocks).toBe(100)
      expect(result.newEvents).toBe(0)

      const events = await FeeCollectedEventModel.find()
      expect(events).toHaveLength(0)
    })

    it('should skip when already caught up', async () => {
      // Set progress to already caught up
      await ScanProgressModel.updateOne(
        { chain: 'polygon' },
        { lastScannedBlock: 77000100 }
      )

      blockchainService.getCurrentBlockNumber.mockResolvedValue(77000100)

      const result = await eventScanner.scan()

      expect(result.scannedBlocks).toBe(0)
      expect(result.newEvents).toBe(0)
      expect(blockchainService.fetchAndParseEvents).not.toHaveBeenCalled()
    })

    it('should not scan beyond current block', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(77000050)
      blockchainService.fetchAndParseEvents.mockResolvedValue([])

      await eventScanner.scan()

      expect(blockchainService.fetchAndParseEvents).toHaveBeenCalledWith(
        77000001,
        77000050 // Should cap at current block, not 77000100
      )
    })
  })

  describe('Progress Tracking', () => {
    beforeEach(async () => {
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 77000000,
        latestBlockNumber: 77001000,
        status: 'idle',
      })
    })

    it('should update progress after successful scan', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(77001000)
      blockchainService.fetchAndParseEvents.mockResolvedValue([])

      await eventScanner.scan()

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' })

      expect(progress!.lastScannedBlock).toBe(77000100) // Moved forward by batch size
      expect(progress!.status).toBe('idle')
      expect(progress!.lastError).toBeUndefined()
    })

    it('should track errors in progress', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(77001000)
      blockchainService.fetchAndParseEvents.mockRejectedValue(
        new Error('RPC connection failed')
      )

      await expect(eventScanner.scan()).rejects.toThrow('RPC connection failed')

      const progress = await ScanProgressModel.findOne({ chain: 'polygon' })

      expect(progress!.status).toBe('error')
      expect(progress!.lastError).toContain('RPC connection failed')
    })
  })

  describe('Batch Processing', () => {
    beforeEach(async () => {
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 77000000,
        latestBlockNumber: 77000500, // 500 blocks behind
        status: 'idle',
      })
    })

    it('should process in batches', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(77000500)
      blockchainService.fetchAndParseEvents.mockResolvedValue([])

      // First batch
      const result1 = await eventScanner.scan()
      expect(result1.scannedBlocks).toBe(100)
      expect(result1.toBlock).toBe(77000100)

      // Second batch
      const result2 = await eventScanner.scan()
      expect(result2.scannedBlocks).toBe(100)
      expect(result2.toBlock).toBe(77000200)
    })
  })
})
