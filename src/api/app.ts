import express, { Express, Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'
import eventsRouter from './routes/events.routes'
import healthRouter from './routes/health.routes'

/**
 * Creates and configures the Express application
 * 
 * @returns Configured Express app with all routes and middleware
 */
export function createApp(): Express {
  const app = express()

  // Middleware for parsing JSON and URL-encoded data
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    })
    next()
  })

  // CORS headers (for browser access)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    next()
  })

  // Routes
  app.use('/api/health', healthRouter)
  app.use('/api/events', eventsRouter)

  // Root endpoint - API documentation
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'LI.FI Fee Collector Scanner API',
      version: '1.0.0',
      description: 'REST API for querying FeeCollector events from EVM chains',
      endpoints: {
        health: {
          path: '/api/health',
          method: 'GET',
          description: 'Health check and scanner status',
        },
        events: {
          path: '/api/events',
          method: 'GET',
          description: 'Query fee collection events',
          queryParams: {
            integrator: 'Filter by integrator address',
            chain: 'Filter by blockchain (default: polygon)',
            token: 'Filter by token address',
            fromBlock: 'Filter from block number',
            toBlock: 'Filter to block number',
            limit: 'Max results (default: 100, max: 1000)',
            offset: 'Pagination offset (default: 0)',
            sortBy: 'Sort field (default: blockNumber)',
            sortOrder: 'Sort order: asc/desc (default: desc)',
          },
          example: '/api/events?integrator=0x1234...&limit=50',
        },
        integrators: {
          path: '/api/events/integrators',
          method: 'GET',
          description: 'List all integrators with event counts',
        },
        stats: {
          path: '/api/events/stats',
          method: 'GET',
          description: 'Aggregated statistics about events',
          queryParams: {
            integrator: 'Filter by integrator (optional)',
            chain: 'Filter by blockchain (default: polygon)',
          },
        },
        eventById: {
          path: '/api/events/:id',
          method: 'GET',
          description: 'Get a specific event by MongoDB _id',
        },
      },
    })
  })

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      message: 'The requested endpoint does not exist',
    })
  })

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error:', err)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    })
  })

  return app
}

