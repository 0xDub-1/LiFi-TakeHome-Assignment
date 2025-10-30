import { Router, Request, Response } from 'express'
import { ScanProgressModel } from '../../models'
import mongoose from 'mongoose'
import { logger } from '../../utils/logger'

const router = Router()

/**
 * GET /api/health
 * Health check endpoint that returns the status of the application and its dependencies
 * 
 * Response includes:
 * - Overall health status
 * - MongoDB connection status
 * - Scanner progress for each chain
 * - Application uptime
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongodb: 'disconnected',
      scanner: {} as Record<string, unknown>,
    }

    // Check MongoDB connection
    if (mongoose.connection.readyState === 1) {
      health.mongodb = 'connected'
    } else {
      health.status = 'unhealthy'
      health.mongodb = 'disconnected'
    }

    // Get scanner progress for all chains
    try {
      const progressRecords = await ScanProgressModel.find().lean().exec()
      
      health.scanner = progressRecords.reduce((acc, curr) => {
        // Calculate blocks behind
        const blocksBehind = (curr.latestBlockNumber || 0) - curr.lastScannedBlock
        const progressPercent = curr.latestBlockNumber
          ? ((curr.lastScannedBlock / curr.latestBlockNumber) * 100).toFixed(2)
          : '0.00'

        acc[curr.chain] = {
          lastScannedBlock: curr.lastScannedBlock,
          latestBlockNumber: curr.latestBlockNumber,
          blocksBehind,
          progressPercent: `${progressPercent}%`,
          status: curr.status,
          lastScanTimestamp: curr.lastScanTimestamp,
          lastError: curr.lastError || null,
        }
        
        // If any scanner has error status, mark overall health as degraded
        if (curr.status === 'error') {
          health.status = 'degraded'
        }
        
        return acc
      }, {} as Record<string, unknown>)
    } catch (error) {
      logger.error('Error fetching scanner progress:', error)
      health.scanner = { error: 'Failed to fetch scanner progress' }
      health.status = 'degraded'
    }

    // Determine HTTP status code
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

    res.status(statusCode).json(health)
  } catch (error) {
    logger.error('Error in health check:', error)
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

export default router

