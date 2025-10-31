import request from 'supertest'
import { Express } from 'express'
import { createApp } from '../../src/api'
import { FeeCollectedEventModel, ScanProgressModel } from '../../src/models'
import { setupTestDatabase, clearTestDatabase, teardownTestDatabase } from '../helpers/db.helper'

describe('API Integration Tests', () => {
  let app: Express

  beforeAll(async () => {
    await setupTestDatabase()
    app = createApp()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  afterEach(async () => {
    await clearTestDatabase()
  })

  describe('GET /', () => {
    it('should return API documentation', async () => {
      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body.name).toContain('LI.FI')
      expect(response.body.endpoints).toBeDefined()
    })
  })

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health')

      expect(response.status).toBe(200)
      expect(response.body.status).toBeDefined()
      expect(response.body.mongodb).toBe('connected')
      expect(response.body.uptime).toBeGreaterThan(0)
    })

    it('should include scanner progress', async () => {
      await ScanProgressModel.create({
        chain: 'polygon',
        lastScannedBlock: 77000000,
        latestBlockNumber: 77000100,
        status: 'scanning',
      })

      const response = await request(app).get('/api/health')

      expect(response.body.scanner.polygon).toBeDefined()
      expect(response.body.scanner.polygon.lastScannedBlock).toBe(77000000)
    })
  })

  describe('GET /api/events', () => {
    beforeEach(async () => {
      // Seed test data
      await FeeCollectedEventModel.create([
        {
          chain: 'polygon',
          transactionHash: '0xabc123',
          blockNumber: 77000050,
          blockTimestamp: 1705320000,
          logIndex: 10,
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          integrator: '0x1234567890abcdef1234567890abcdef12345678',
          integratorFee: '1000000',
          lifiFee: '500000',
        },
        {
          chain: 'polygon',
          transactionHash: '0xdef456',
          blockNumber: 77000051,
          blockTimestamp: 1705320002,
          logIndex: 5,
          token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
          integrator: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          integratorFee: '2000000',
          lifiFee: '750000',
        },
        {
          chain: 'polygon',
          transactionHash: '0xghi789',
          blockNumber: 77000052,
          blockTimestamp: 1705320004,
          logIndex: 15,
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          integrator: '0x1234567890abcdef1234567890abcdef12345678',
          integratorFee: '3000000',
          lifiFee: '1000000',
        },
      ])
    })

    it('should return all events', async () => {
      const response = await request(app).get('/api/events')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(3)
      expect(response.body.pagination.total).toBe(3)
    })

    it('should filter by integrator', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ integrator: '0x1234567890abcdef1234567890abcdef12345678' })

      expect(response.status).toBe(200)
      expect(response.body.data).toHaveLength(2)
      expect(response.body.data[0].integrator).toBe('0x1234567890abcdef1234567890abcdef12345678')
    })

    it('should filter by token', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' })

      expect(response.status).toBe(200)
      expect(response.body.data).toHaveLength(2)
    })

    it('should filter by block range', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ fromBlock: 77000051, toBlock: 77000052 })

      expect(response.status).toBe(200)
      expect(response.body.data).toHaveLength(2)
    })

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ limit: 2, offset: 1 })

      expect(response.status).toBe(200)
      expect(response.body.data).toHaveLength(2)
      expect(response.body.pagination.limit).toBe(2)
      expect(response.body.pagination.offset).toBe(1)
      expect(response.body.pagination.hasMore).toBe(false)
    })

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ sortBy: 'blockNumber', sortOrder: 'asc' })

      expect(response.status).toBe(200)
      expect(response.body.data[0].blockNumber).toBe(77000050)
      expect(response.body.data[2].blockNumber).toBe(77000052)
    })

    it('should handle case-insensitive integrator address', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ integrator: '0x1234567890ABCDEF1234567890ABCDEF12345678' }) // Uppercase

      expect(response.status).toBe(200)
      expect(response.body.data).toHaveLength(2)
    })

    it('should return empty array when no matches', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ integrator: '0x0000000000000000000000000000000000000000' })

      expect(response.status).toBe(200)
      expect(response.body.data).toHaveLength(0)
    })
  })

  describe('GET /api/events/integrators', () => {
    beforeEach(async () => {
      await FeeCollectedEventModel.create([
        {
          chain: 'polygon',
          transactionHash: '0xabc1',
          blockNumber: 77000050,
          blockTimestamp: 1705320000,
          logIndex: 1,
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          integrator: '0x1234567890abcdef1234567890abcdef12345678',
          integratorFee: '1000000',
          lifiFee: '500000',
        },
        {
          chain: 'polygon',
          transactionHash: '0xabc2',
          blockNumber: 77000051,
          blockTimestamp: 1705320002,
          logIndex: 2,
          token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
          integrator: '0x1234567890abcdef1234567890abcdef12345678',
          integratorFee: '2000000',
          lifiFee: '750000',
        },
        {
          chain: 'polygon',
          transactionHash: '0xabc3',
          blockNumber: 77000052,
          blockTimestamp: 1705320004,
          logIndex: 3,
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          integrator: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          integratorFee: '3000000',
          lifiFee: '1000000',
        },
      ])
    })

    it('should return list of unique integrators', async () => {
      const response = await request(app).get('/api/events/integrators')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(2)
      expect(response.body.count).toBe(2)
    })

    it('should include event counts', async () => {
      const response = await request(app).get('/api/events/integrators')

      const integrator1 = response.body.data.find(
        (i: any) => i.integrator === '0x1234567890abcdef1234567890abcdef12345678'
      )

      expect(integrator1.eventCount).toBe(2)
    })

    it('should include token counts', async () => {
      const response = await request(app).get('/api/events/integrators')

      const integrator1 = response.body.data.find(
        (i: any) => i.integrator === '0x1234567890abcdef1234567890abcdef12345678'
      )

      expect(integrator1.tokenCount).toBe(2) // Used 2 different tokens
    })
  })

  describe('GET /api/events/stats', () => {
    beforeEach(async () => {
      await FeeCollectedEventModel.create([
        {
          chain: 'polygon',
          transactionHash: '0xabc1',
          blockNumber: 77000050,
          blockTimestamp: 1705320000,
          logIndex: 1,
          token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          integrator: '0x1234567890abcdef1234567890abcdef12345678',
          integratorFee: '1000000',
          lifiFee: '500000',
        },
        {
          chain: 'polygon',
          transactionHash: '0xabc2',
          blockNumber: 77000100,
          blockTimestamp: 1705320100,
          logIndex: 2,
          token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
          integrator: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          integratorFee: '2000000',
          lifiFee: '750000',
        },
      ])
    })

    it('should return aggregated statistics', async () => {
      const response = await request(app).get('/api/events/stats')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.totalEvents).toBe(2)
      expect(response.body.data.uniqueIntegratorsCount).toBe(2)
      expect(response.body.data.uniqueTokensCount).toBe(2)
    })

    it('should include block range', async () => {
      const response = await request(app).get('/api/events/stats')

      expect(response.body.data.earliestBlock).toBe(77000050)
      expect(response.body.data.latestBlock).toBe(77000100)
    })

    it('should filter stats by integrator', async () => {
      const response = await request(app)
        .get('/api/events/stats')
        .query({ integrator: '0x1234567890abcdef1234567890abcdef12345678' })

      expect(response.status).toBe(200)
      expect(response.body.data.totalEvents).toBe(1)
    })
  })

  describe('GET /api/events/:id', () => {
    it('should return specific event by ID', async () => {
      const event = await FeeCollectedEventModel.create({
        chain: 'polygon',
        transactionHash: '0xabc123',
        blockNumber: 77000050,
        blockTimestamp: 1705320000,
        logIndex: 10,
        token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        integrator: '0x1234567890abcdef1234567890abcdef12345678',
        integratorFee: '1000000',
        lifiFee: '500000',
      })

      const response = await request(app).get(`/api/events/${event._id}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.transactionHash).toBe('0xabc123')
    })

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011'

      const response = await request(app).get(`/api/events/${fakeId}`)

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })
  })

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/api/unknown')

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('not found')
    })
  })
})

