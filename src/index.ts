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
      logger.info(`${signal} received, shutting down gracefully...`)
      console.log(`\n🛑 ${signal} received, shutting down...`)

      // Stop scanning
      stopScanning()
      logger.info('Scanner stopped')

      // Close API server
      if (apiServer) {
        await new Promise<void>((resolve, reject) => {
          apiServer!.close(err => {
            if (err) reject(err)
            else resolve()
          })
        })
        logger.info('API server stopped')
      }

      // Close database connection
      await closeDatabaseConnection()
      logger.info('Database connection closed')

      console.log('✅ Shutdown complete')
      process.exit(0)
    }

    // Register shutdown handlers
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))

    // Keep the process running
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception:', error)
      shutdown('UNCAUGHT_EXCEPTION')
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason)
      shutdown('UNHANDLED_REJECTION')
    })
  } catch (error) {
    logger.error('Fatal error during startup:', error)
    console.error('❌ Failed to start application:', error)
    process.exit(1)
  }
}

// Start the application
main()

