import { Router, Request, Response } from 'express'
import { FeeCollectedEventModel } from '../../models'
import { logger } from '../../utils/logger'

const router = Router()

/**
 * GET /api/events
 * Retrieves fee collection events with optional filtering
 *
 * Query parameters:
 * - integrator: Filter by integrator address (required or optional based on use case)
 * - chain: Filter by blockchain (default: polygon)
 * - token: Filter by token address
 * - fromBlock: Filter events from this block number onwards
 * - toBlock: Filter events up to this block number
 * - limit: Maximum number of results to return (default: 100, max: 1000)
 * - offset: Number of results to skip for pagination (default: 0)
 * - sortBy: Field to sort by (default: blockNumber)
 * - sortOrder: Sort order: asc or desc (default: desc)
 *
 * Example: GET /api/events?integrator=0x1234...&limit=50
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      integrator,
      chain = 'polygon',
      token,
      fromBlock,
      toBlock,
      limit = '100',
      offset = '0',
      sortBy = 'blockNumber',
      sortOrder = 'desc',
    } = req.query

    // Build query filter
    const filter: Record<string, unknown> = { chain }

    if (integrator) {
      filter.integrator = (integrator as string).toLowerCase()
    }

    if (token) {
      filter.token = (token as string).toLowerCase()
    }

    if (fromBlock || toBlock) {
      filter.blockNumber = {}
      if (fromBlock) {
        ;(filter.blockNumber as Record<string, unknown>).$gte = parseInt(fromBlock as string, 10)
      }
      if (toBlock) {
        ;(filter.blockNumber as Record<string, unknown>).$lte = parseInt(toBlock as string, 10)
      }
    }

    // Parse and validate pagination parameters
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10), 1), 1000)
    const offsetNum = Math.max(parseInt(offset as string, 10), 0)

    // Build sort object
    const sortField = sortBy as string
    const sortDirection = sortOrder === 'asc' ? 1 : -1
    const sort: Record<string, 1 | -1> = { [sortField]: sortDirection }

    // Add secondary sort by logIndex for consistent ordering within same block
    if (sortField !== 'logIndex') {
      sort.logIndex = sortDirection
    }

    logger.info('Fetching events', { filter, limit: limitNum, offset: offsetNum, sort })

    // Execute query with pagination
    const [events, total] = await Promise.all([
      FeeCollectedEventModel.find(filter)
        .sort(sort)
        .limit(limitNum)
        .skip(offsetNum)
        .lean()
        .exec(),
      FeeCollectedEventModel.countDocuments(filter),
    ])

    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        count: events.length,
        hasMore: offsetNum + events.length < total,
      },
      filter: {
        chain,
        integrator: integrator || null,
        token: token || null,
        fromBlock: fromBlock ? parseInt(fromBlock as string, 10) : null,
        toBlock: toBlock ? parseInt(toBlock as string, 10) : null,
      },
    })
  } catch (error) {
    logger.error('Error fetching events:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * GET /api/events/integrators
 * Retrieves a list of all unique integrators with event counts
 *
 * Query parameters:
 * - chain: Filter by blockchain (default: polygon)
 */
router.get('/integrators', async (req: Request, res: Response) => {
  try {
    const { chain = 'polygon' } = req.query

    logger.info('Fetching unique integrators', { chain })

    // Get unique integrators with counts
    const integrators = await FeeCollectedEventModel.aggregate([
      { $match: { chain } },
      {
        $group: {
          _id: '$integrator',
          eventCount: { $sum: 1 },
          firstSeen: { $min: '$blockTimestamp' },
          lastSeen: { $max: '$blockTimestamp' },
          uniqueTokens: { $addToSet: '$token' },
        },
      },
      {
        $project: {
          _id: 0,
          integrator: '$_id',
          eventCount: 1,
          firstSeen: 1,
          lastSeen: 1,
          tokenCount: { $size: '$uniqueTokens' },
        },
      },
      { $sort: { eventCount: -1 } },
    ])

    res.json({
      success: true,
      data: integrators,
      count: integrators.length,
      chain,
    })
  } catch (error) {
    logger.error('Error fetching integrators:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch integrators',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * GET /api/events/stats
 * Retrieves aggregated statistics about fee collection
 *
 * Query parameters:
 * - integrator: Filter by integrator address (optional)
 * - chain: Filter by blockchain (default: polygon)
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { integrator, chain = 'polygon' } = req.query

    const matchFilter: Record<string, unknown> = { chain }
    if (integrator) {
      matchFilter.integrator = (integrator as string).toLowerCase()
    }

    logger.info('Fetching event statistics', { matchFilter })

    const stats = await FeeCollectedEventModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          uniqueIntegrators: { $addToSet: '$integrator' },
          uniqueTokens: { $addToSet: '$token' },
          earliestBlock: { $min: '$blockNumber' },
          latestBlock: { $max: '$blockNumber' },
          earliestTimestamp: { $min: '$blockTimestamp' },
          latestTimestamp: { $max: '$blockTimestamp' },
        },
      },
      {
        $project: {
          _id: 0,
          totalEvents: 1,
          uniqueIntegratorsCount: { $size: '$uniqueIntegrators' },
          uniqueTokensCount: { $size: '$uniqueTokens' },
          earliestBlock: 1,
          latestBlock: 1,
          earliestTimestamp: 1,
          latestTimestamp: 1,
        },
      },
    ])

    const result = stats[0] || {
      totalEvents: 0,
      uniqueIntegratorsCount: 0,
      uniqueTokensCount: 0,
      earliestBlock: null,
      latestBlock: null,
      earliestTimestamp: null,
      latestTimestamp: null,
    }

    res.json({
      success: true,
      data: result,
      filter: {
        chain,
        integrator: integrator || null,
      },
    })
  } catch (error) {
    logger.error('Error fetching statistics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * GET /api/events/:id
 * Retrieves a single event by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    logger.info('Fetching event by ID', { id })

    const event = await FeeCollectedEventModel.findById(id).lean().exec()

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      })
    }

    res.json({
      success: true,
      data: event,
    })
  } catch (error) {
    logger.error('Error fetching event by ID:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

export default router

