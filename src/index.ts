/**
 * LI.FI Fee Collector Event Scanner
 * Main application entry point
 * 
 * This application scans the LI.FI FeeCollector contract on Polygon
 * for FeesCollected events and stores them in MongoDB.
 * 
 * Run with: npm run dev
 */

import { connectToDatabase, closeDatabaseConnection } from './database/connection'
import { BlockchainService, EventScannerService } from './services'
import { config, validateConfig } from './config'
import { logger } from './utils/logger'
import { createApp } from './api'
import { Server } from 'http'

/**
 * Main application function
 * Initializes all services and starts the event scanner
 */
async function main() {
  let apiServer: Server | null = null
  let isShuttingDown = false

  try {
    console.log('═══════════════════════════════════════════════════')
    console.log('🚀 LI.FI Fee Collector Event Scanner')
    console.log('═══════════════════════════════════════════════════\n')

    // Step 1: Validate configuration
    logger.info('Validating configuration...')
    validateConfig()
    logger.info('Configuration validated successfully')

    // Step 2: Connect to MongoDB
    logger.info('Connecting to database...')
    await connectToDatabase()
    logger.info('Database connected successfully')

    // Step 3: Start REST API
    logger.info('Starting REST API...')
    const app = createApp()
    apiServer = app.listen(config.api.port, () => {
      logger.info(`API server started on port ${config.api.port}`)
      console.log(`\n🌐 API Server: http://localhost:${config.api.port}`)
      console.log(`   Health: http://localhost:${config.api.port}/api/health`)
      console.log(`   Events: http://localhost:${config.api.port}/api/events\n`)
    })

    // Step 4: Initialize BlockchainService
    logger.info('Initializing blockchain service...')
    const blockchainService = new BlockchainService(
      config.blockchain.rpcUrl,
      config.blockchain.feeCollectorAddress
    )

    // Validate blockchain connection
    await blockchainService.validateConnection()
    logger.info('Blockchain connection validated')

    // Step 5: Initialize EventScannerService
    logger.info('Initializing event scanner service...')
    const eventScanner = new EventScannerService(
      blockchainService,
      config.blockchain.chain,
      config.blockchain.oldestBlock,
      config.scanner.blocksPerBatch
    )

    // Step 6: Perform initial scan
    logger.info('Performing initial scan...')
    const initialScanResult = await eventScanner.scan()
    logger.info('Initial scan completed', {
      scannedBlocks: initialScanResult.scannedBlocks,
      newEvents: initialScanResult.newEvents,
      fromBlock: initialScanResult.fromBlock,
      toBlock: initialScanResult.toBlock,
    })

    // Step 7: Start continuous scanning
    logger.info(`Starting continuous scanning (interval: ${config.scanner.intervalMs}ms)...`)
    const stopScanning = eventScanner.startContinuousScanning()

    console.log('\n═══════════════════════════════════════════════════')
    console.log('✅ Scanner is running!')
    console.log('═══════════════════════════════════════════════════')
    console.log(`📊 Chain: ${config.blockchain.chain}`)
    console.log(`⏰ Scan interval: ${config.scanner.intervalMs / 1000}s (maintenance mode)`)
    console.log(`📦 Blocks per batch: ${config.scanner.blocksPerBatch}`)
    console.log(`🔗 Contract: ${config.blockchain.feeCollectorAddress}`)
    console.log(`🌐 API: http://localhost:${config.api.port}`)
    console.log(`\n💡 Press Ctrl+C to stop\n`)

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      // Prevent multiple shutdown calls (this was causing infinite loop)
      if (isShuttingDown) {
        console.log(`⚠️  Shutdown already in progress, ignoring ${signal}`)
        return
      }
      
      isShuttingDown = true
      
      logger.info(`${signal} received, shutting down gracefully...`)
      console.log(`\n🛑 ${signal} received, shutting down...`)

      // Set a timeout to force exit if shutdown hangs
      const forceExitTimeout = setTimeout(() => {
        console.log('⚠️  Shutdown taking too long, forcing exit')
        process.exit(1)
      }, 10000) // 10 seconds max

      try {
        // Stop scanning
        if (typeof stopScanning === 'function') {
          stopScanning()
          logger.info('Scanner stopped')
        }

        // Close API server
        if (apiServer) {
          await new Promise<void>((resolve) => {
            apiServer!.close(err => {
              if (err) {
                logger.error('Error closing API server:', err)
              }
              resolve() // Always resolve, even on error
            })
          })
          logger.info('API server stopped')
        }

        // Close database connection
        try {
          await closeDatabaseConnection()
          logger.info('Database connection closed')
        } catch (error) {
          logger.error('Error closing database:', error)
        }

        clearTimeout(forceExitTimeout)
        console.log('✅ Shutdown complete')
        process.exit(0)
      } catch (error) {
        logger.error('Error during shutdown:', error)
        clearTimeout(forceExitTimeout)
        process.exit(1)
      }
    }

    // Register shutdown handlers
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))

    // Keep the process running
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception:', error)
      // Call shutdown without await (shutdown handles its own errors now)
      shutdown('UNCAUGHT_EXCEPTION').catch(err => {
        console.error('Fatal error during shutdown:', err)
        process.exit(1)
      })
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason)
      // Call shutdown without await (shutdown handles its own errors now)
      shutdown('UNHANDLED_REJECTION').catch(err => {
        console.error('Fatal error during shutdown:', err)
        process.exit(1)
      })
    })
  } catch (error) {
    logger.error('Fatal error during startup:', error)
    console.error('❌ Failed to start application:', error)
    process.exit(1)
  }
}

// Start the application
main()

