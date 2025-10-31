import { BlockchainService, ParsedFeeCollectedEvent } from './blockchain.service'
import { FeeCollectedEventModel, ScanProgressModel } from '../models'
import { logger } from '../utils/logger'
import { config } from '../config'
import { RateLimitHandler } from '../utils/rateLimitHandler'

/**
 * Service responsible for scanning blockchain events and storing them in the database
 * Implements efficient scanning by tracking progress and avoiding duplicate scans
 */
export class EventScannerService {
  private readonly blockchainService: BlockchainService
  private readonly chain: string
  private readonly oldestBlock: number
  private readonly blocksPerBatch: number
  private readonly rateLimitHandler: RateLimitHandler
  private isScanning: boolean = false

  /**
   * Creates a new EventScannerService instance
   * 
   * @param blockchainService - The blockchain service to use for reading events
   * @param chain - The blockchain identifier (e.g., 'polygon', 'ethereum')
   * @param oldestBlock - The oldest block to scan (don't go before this)
   * @param blocksPerBatch - How many blocks to scan in each batch
   */
  constructor(
    blockchainService: BlockchainService,
    chain: string = 'polygon',
    oldestBlock?: number,
    blocksPerBatch?: number,
    rateLimitHandler?: RateLimitHandler
  ) {
    this.blockchainService = blockchainService
    this.chain = chain
    this.oldestBlock = oldestBlock || config.blockchain.oldestBlock
    this.blocksPerBatch = blocksPerBatch || config.scanner.blocksPerBatch
    this.rateLimitHandler = rateLimitHandler || new RateLimitHandler()

    logger.info('EventScannerService initialized', {
      chain: this.chain,
      oldestBlock: this.oldestBlock,
      blocksPerBatch: this.blocksPerBatch,
    })
  }

  /**
   * Initializes the scan progress for this chain if it doesn't exist
   * This is the "starting point" for the scanner
   * 
   * @returns The current scan progress document
   */
  private async initializeScanProgress() {
    let progress = await ScanProgressModel.findOne({ chain: this.chain })

    if (!progress) {
      logger.info('Initializing scan progress for chain', { chain: this.chain })

      progress = await ScanProgressModel.create({
        chain: this.chain,
        lastScannedBlock: this.oldestBlock - 1, // Start one block before oldest
        lastScanTimestamp: new Date(),
        status: 'idle',
      })
    }

    return progress
  }

  /**
   * Updates the scan progress in the database
   * This is how we remember where we left off
   * 
   * @param lastScannedBlock - The last block that was successfully scanned
   * @param status - The current status of the scanner
   * @param error - Optional error message if something went wrong
   */
  private async updateScanProgress(
    lastScannedBlock: number,
    status: 'idle' | 'scanning' | 'error',
    error?: string
  ) {
    const latestBlock = await this.blockchainService.getCurrentBlockNumber()

    await ScanProgressModel.updateOne(
      { chain: this.chain },
      {
        lastScannedBlock,
        lastScanTimestamp: new Date(),
        status,
        lastError: error,
        latestBlockNumber: latestBlock,
      },
      { upsert: true }
    )

    logger.debug('Scan progress updated', {
      chain: this.chain,
      lastScannedBlock,
      status,
    })
  }

  /**
   * Stores parsed events in the database
   * Uses bulkWrite with upsert to avoid duplicates efficiently
   * 
   * @param events - Array of parsed events to store
   * @returns Number of new events inserted
   */
  private async storeEvents(events: ParsedFeeCollectedEvent[]): Promise<number> {
    if (events.length === 0) {
      return 0
    }

    try {
      let insertedCount = 0

      // Use bulkWrite for efficient batch insertion with duplicate handling
      // This is MUCH faster than inserting one by one
      const operations = events.map(event => ({
        updateOne: {
          filter: {
            chain: this.chain,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
          },
          update: {
            $setOnInsert: {
              chain: this.chain,
              token: event.token,
              integrator: event.integrator,
              integratorFee: event.integratorFee.toString(),
              lifiFee: event.lifiFee.toString(),
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              logIndex: event.logIndex,
              blockTimestamp: event.blockTimestamp,
            },
          },
          upsert: true,
        },
      }))

      const result = await FeeCollectedEventModel.bulkWrite(operations, { ordered: false })
      insertedCount = result.upsertedCount

      logger.info('Events stored in database', {
        totalEvents: events.length,
        inserted: insertedCount,
        duplicatesSkipped: events.length - insertedCount,
      })

      return insertedCount
    } catch (error) {
      logger.error('Error storing events in database:', error)
      throw new Error(`Failed to store events: ${error}`)
    }
  }

  /**
   * Scans a specific block range for events
   * 
   * @param fromBlock - Starting block number (inclusive)
   * @param toBlock - Ending block number (inclusive)
   * @returns Number of new events found and stored
   */
  async scanBlockRange(fromBlock: number, toBlock: number): Promise<number> {
    try {
      logger.info('Scanning block range', { fromBlock, toBlock })

      // Fetch and parse events from blockchain
      const events = await this.blockchainService.fetchAndParseEvents(fromBlock, toBlock)

      // Store events in database
      const insertedCount = await this.storeEvents(events)

      return insertedCount
    } catch (error) {
      logger.error('Error scanning block range:', { error, fromBlock, toBlock })
      throw error
    }
  }

  /**
   * Performs a single scan iteration
   * This is the main scanning logic that:
   * 1. Checks where we left off (ScanProgress)
   * 2. Scans the next batch of blocks
   * 3. Stores the events
   * 4. Updates the progress
   * 
   * @returns Object containing scan statistics
   */
  async scan(): Promise<{
    scannedBlocks: number
    newEvents: number
    fromBlock: number
    toBlock: number
  }> {
    if (this.isScanning) {
      logger.warn('Scan already in progress, skipping')
      return { scannedBlocks: 0, newEvents: 0, fromBlock: 0, toBlock: 0 }
    }

    this.isScanning = true

    try {
      // Initialize or get scan progress
      const progress = await this.initializeScanProgress()
      const currentBlock = await this.blockchainService.getCurrentBlockNumber()

      // Determine the range to scan
      const fromBlock = progress.lastScannedBlock + 1
      const toBlock = Math.min(fromBlock + this.blocksPerBatch - 1, currentBlock)

      // Check if there are new blocks to scan
      if (fromBlock > currentBlock) {
        logger.info('No new blocks to scan', { currentBlock, lastScannedBlock: fromBlock - 1 })
        await this.updateScanProgress(progress.lastScannedBlock, 'idle')
        return { scannedBlocks: 0, newEvents: 0, fromBlock, toBlock: fromBlock }
      }

      // Update status to scanning
      await this.updateScanProgress(progress.lastScannedBlock, 'scanning')

      // Scan the block range
      const newEvents = await this.scanBlockRange(fromBlock, toBlock)

      // Update progress
      await this.updateScanProgress(toBlock, 'idle')

      const scannedBlocks = toBlock - fromBlock + 1

      logger.info('Scan completed successfully', {
        fromBlock,
        toBlock,
        scannedBlocks,
        newEvents,
      })

      return { scannedBlocks, newEvents, fromBlock, toBlock }
    } catch (error) {
      logger.error('Error during scan:', error)
      const progress = await ScanProgressModel.findOne({ chain: this.chain })
      if (progress) {
        await this.updateScanProgress(
          progress.lastScannedBlock,
          'error',
          error instanceof Error ? error.message : String(error)
        )
      }
      throw error
    } finally {
      this.isScanning = false
    }
  }


  /**
   * Starts continuous scanning with catch-up mode
   * - If behind: scans continuously without delays (catch-up mode)
   * - If caught up: scans at regular intervals (maintenance mode)
   * - Handles rate limits: respects retry delays from RPC
   * 
   * @param intervalMs - Interval between scans in milliseconds (when caught up)
   * @returns Function to stop the continuous scanning
   */
  startContinuousScanning(intervalMs?: number): () => void {
    const interval = intervalMs || config.scanner.intervalMs
    let shouldStop = false
    let timeoutId: NodeJS.Timeout | null = null

    logger.info('Starting continuous scanning with catch-up mode', { intervalMs: interval })

    /**
     * Wrapper function to safely execute scanLoop and catch any unhandled errors
     * This prevents unhandled promise rejections from crashing the application
     */
    const safeScanLoop = () => {
      // Call the async scanLoop and catch any errors that escape the try/catch
      scanLoop().catch(error => {
        logger.error('Critical error in scan loop (caught by safety wrapper):', error)
        // Schedule retry after interval to keep the scanner running
        if (!shouldStop) {
          timeoutId = setTimeout(safeScanLoop, interval)
        }
      })
    }

    const scanLoop = async () => {
      if (shouldStop) return

      try {
        const result = await this.scan()

        // Check if we're caught up
        const progress = await this.getScanProgress()
        if (!progress) {
          // Schedule next scan after interval
          timeoutId = setTimeout(safeScanLoop, interval)
          return
        }

        const blocksBehind = (progress.latestBlockNumber || 0) - progress.lastScannedBlock

        if (result.scannedBlocks === 0 || blocksBehind <= this.blocksPerBatch) {
          // We're caught up! Use regular interval
          logger.info('Scanner caught up, switching to maintenance mode', {
            blocksBehind,
            lastScannedBlock: progress.lastScannedBlock,
            latestBlock: progress.latestBlockNumber,
          })
          timeoutId = setTimeout(safeScanLoop, interval)
        } else {
          // Still behind, scan immediately (catch-up mode)
          logger.info('Scanner in catch-up mode, scanning continuously', {
            blocksBehind,
            blocksPerBatch: this.blocksPerBatch,
            progress: `${((progress.lastScannedBlock / (progress.latestBlockNumber || 1)) * 100).toFixed(2)}%`,
          })
          // Small delay to prevent overwhelming the RPC
          timeoutId = setTimeout(safeScanLoop, 2000) // 2 seconds between scans (increased for rate limit safety)
        }
      } catch (error) {
        // Analyze error to check if it's a rate limit
        const rateLimitInfo = this.rateLimitHandler.analyzeError(error)
        
        if (rateLimitInfo.isRateLimit && rateLimitInfo.retryDelayMs) {
          // Log rate limit information
          this.rateLimitHandler.logRateLimit(rateLimitInfo, {
            chain: this.chain,
            message: error instanceof Error ? error.message : String(error),
          })
          
          // Wait for the specified delay
          timeoutId = setTimeout(safeScanLoop, rateLimitInfo.retryDelayMs)
        } else {
          // For other errors, use standard interval
          logger.error('Error in continuous scan iteration:', error)
          timeoutId = setTimeout(safeScanLoop, interval)
        }
      }
    }

    // Start the scan loop with the safety wrapper
    safeScanLoop()

    // Return stop function
    return () => {
      logger.info('Stopping continuous scanning')
      shouldStop = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  /**
   * Gets the current scan progress for this chain
   * Useful for monitoring and health checks
   * 
   * @returns Current scan progress or null if not initialized
   */
  async getScanProgress() {
    return ScanProgressModel.findOne({ chain: this.chain })
  }

  /**
   * Resets the scan progress to start from the oldest block
   * WARNING: This does not delete existing events, only resets the scan pointer
   * Use this if you want to re-scan from the beginning (e.g., after fixing a bug)
   */
  async resetScanProgress() {
    logger.warn('Resetting scan progress', { chain: this.chain })

    await ScanProgressModel.updateOne(
      { chain: this.chain },
      {
        lastScannedBlock: this.oldestBlock - 1,
        lastScanTimestamp: new Date(),
        status: 'idle',
        lastError: undefined,
      },
      { upsert: true }
    )
  }
}

