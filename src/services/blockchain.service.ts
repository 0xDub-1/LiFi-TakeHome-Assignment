import { BigNumber, ethers } from 'ethers'
import { BlockTag } from '@ethersproject/abstract-provider'
import { FeeCollectorABI } from '../contracts/FeeCollector.abi'
import { logger } from '../utils/logger'
import { RateLimitHandler } from '../utils/rateLimitHandler'

/**
 * Interface for parsed FeesCollected events
 * Represents a single fee collection event from the FeeCollector contract
 */
export interface ParsedFeeCollectedEvent {
  token: string
  integrator: string
  integratorFee: BigNumber
  lifiFee: BigNumber
  blockNumber: number
  transactionHash: string
  logIndex: number
  blockTimestamp: Date
}

/**
 * Service responsible for interacting with the blockchain
 * Handles querying and parsing of FeeCollector contract events
 * Includes rate limit handling and efficient timestamp caching
 */
export class BlockchainService {
  private provider: ethers.providers.JsonRpcProvider
  private contract: ethers.Contract
  private readonly contractAddress: string
  private readonly rpcUrl: string
  private readonly rateLimitHandler: RateLimitHandler

  /**
   * Creates a new BlockchainService instance
   * 
   * @param rpcUrl - The RPC endpoint URL (e.g., https://polygon-rpc.com)
   * @param contractAddress - The FeeCollector contract address
   */
  constructor(rpcUrl: string, contractAddress: string) {
    this.rpcUrl = rpcUrl
    this.contractAddress = contractAddress
    this.rateLimitHandler = new RateLimitHandler({
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 60000, // 1 minute max for exponential backoff
      useExponentialBackoff: true,
    })
    
    // Create a provider to connect to the blockchain
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl)
    
    // Create a contract instance with the ABI and provider
    this.contract = new ethers.Contract(
      contractAddress,
      FeeCollectorABI,
      this.provider
    )

    logger.info('BlockchainService initialized', {
      rpcUrl,
      contractAddress,
    })
  }

  /**
   * Reinitializes the provider connection
   * Used when the provider enters an error state (e.g., NETWORK_ERROR)
   * 
   * @private
   */
  private reinitializeProvider(): void {
    logger.warn('Reinitializing blockchain provider due to connection error', {
      rpcUrl: this.rpcUrl,
    })
    
    this.provider = new ethers.providers.JsonRpcProvider(this.rpcUrl)
    this.contract = new ethers.Contract(
      this.contractAddress,
      FeeCollectorABI,
      this.provider
    )
  }

  /**
   * Gets the current block number from the blockchain
   * Includes retry logic with rate limit handling
   * 
   * @returns The latest block number
   * @throws Error if unable to fetch block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    let retries = 0
    const maxRetries = 5 // Match the constructor configuration

    while (retries <= maxRetries) {
      try {
        const blockNumber = await this.provider.getBlockNumber()
        logger.debug('Current block number fetched', { blockNumber })
        return blockNumber
      } catch (error: any) {
        // Handle NETWORK_ERROR by reinitializing the provider
        if (error.code === 'NETWORK_ERROR') {
          this.reinitializeProvider()
          
          // Retry once after reinitializing
          if (retries === 0) {
            retries++
            continue
          }
        }

        // Check if it's a rate limit error
        const rateLimitInfo = this.rateLimitHandler.analyzeError(error)
        
        if (rateLimitInfo.isRateLimit && this.rateLimitHandler.shouldRetry(retries)) {
          this.rateLimitHandler.logRateLimit(rateLimitInfo, { 
            operation: 'getCurrentBlockNumber',
          })
          
          // Wait for the specified delay or use exponential backoff
          const delay = rateLimitInfo.retryDelayMs || 
                       this.rateLimitHandler.calculateBackoffDelay(retries)
          
          logger.info(`Waiting ${Math.round(delay / 1000)}s before retrying...`, {
            operation: 'getCurrentBlockNumber',
            attempt: retries + 1,
            maxRetries,
          })
          
          await new Promise(resolve => setTimeout(resolve, delay))
          retries++
          continue
        }

        // If it's not a rate limit error or we're out of retries
        logger.error('Error fetching current block number:', error)
        throw new Error(`Failed to fetch current block number: ${error}`)
      }
    }

    throw new Error('Max retries exceeded while fetching current block number')
  }

  /**
   * Loads FeesCollected events for a given block range
   * Includes retry logic with rate limit handling
   * 
   * @param fromBlock - Starting block number (inclusive)
   * @param toBlock - Ending block number (inclusive)
   * @returns Array of raw ethers events
   * @throws Error if query fails
   */
  async loadFeeCollectorEvents(
    fromBlock: BlockTag,
    toBlock: BlockTag
  ): Promise<ethers.Event[]> {
    let retries = 0
    const maxRetries = 5 // Match the constructor configuration

    while (retries <= maxRetries) {
      try {
        logger.info('Loading FeeCollector events', { fromBlock, toBlock })

        // Create a filter for FeesCollected events
        const filter = this.contract.filters.FeesCollected()
        
        // Query the blockchain for events in the specified range
        const events = await this.contract.queryFilter(filter, fromBlock, toBlock)

        logger.info('FeeCollector events loaded', {
          fromBlock,
          toBlock,
          eventCount: events.length,
        })

        return events
      } catch (error: any) {
        // Handle NETWORK_ERROR by reinitializing the provider
        if (error.code === 'NETWORK_ERROR') {
          this.reinitializeProvider()
        }

        // Check if it's a rate limit error
        const rateLimitInfo = this.rateLimitHandler.analyzeError(error)
        
        if (rateLimitInfo.isRateLimit && this.rateLimitHandler.shouldRetry(retries)) {
          this.rateLimitHandler.logRateLimit(rateLimitInfo, { 
            operation: 'loadFeeCollectorEvents',
            fromBlock,
            toBlock,
          })
          
          // Wait for the specified delay or use exponential backoff
          const delay = rateLimitInfo.retryDelayMs || 
                       this.rateLimitHandler.calculateBackoffDelay(retries)
          
          logger.info(`Waiting ${Math.round(delay / 1000)}s before retrying...`, {
            operation: 'loadFeeCollectorEvents',
            attempt: retries + 1,
            maxRetries,
          })
          
          await new Promise(resolve => setTimeout(resolve, delay))
          retries++
          continue
        }

        // If it's not a rate limit error or we're out of retries
        logger.error('Error loading FeeCollector events:', {
          error,
          fromBlock,
          toBlock,
        })
        throw new Error(`Failed to load events from ${fromBlock} to ${toBlock}: ${error}`)
      }
    }

    throw new Error('Max retries exceeded while loading events')
  }

  /**
   * Parses raw ethers events into structured ParsedFeeCollectedEvent objects
   * Enriches events with block timestamp information
   * Uses caching to minimize RPC calls for block timestamps
   * Includes retry logic with rate limit handling
   * 
   * @param events - Array of raw ethers events
   * @returns Array of parsed events with additional metadata
   * @throws Error if parsing fails
   */
  async parseFeeCollectorEvents(events: ethers.Event[]): Promise<ParsedFeeCollectedEvent[]> {
    let retries = 0
    const maxRetries = 5 // Match the constructor configuration

    while (retries <= maxRetries) {
      try {
        logger.debug('Parsing FeeCollector events', { eventCount: events.length })

        const parsedEvents: ParsedFeeCollectedEvent[] = []
        
        // 🎯 Cache to store block timestamps (key: blockNumber, value: Date)
        // This dramatically reduces RPC calls when multiple events are in the same block
        const blockTimestampCache = new Map<number, Date>()

        for (const event of events) {
          // Parse the event using the contract interface
          const parsedLog = this.contract.interface.parseLog(event)

          // 🎯 Get timestamp from cache or fetch it
          let blockTimestamp: Date

          if (blockTimestampCache.has(event.blockNumber)) {
            // Cache hit - reuse the timestamp
            blockTimestamp = blockTimestampCache.get(event.blockNumber)!
            logger.debug('Using cached block timestamp', {
              blockNumber: event.blockNumber,
            })
          } else {
            // Cache miss - fetch the block
            const block = await this.provider.getBlock(event.blockNumber)

            if (!block) {
              logger.warn('Block not found for event', {
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
              })
              continue
            }

            // Store in cache for future events in the same block
            blockTimestamp = new Date(block.timestamp * 1000)
            blockTimestampCache.set(event.blockNumber, blockTimestamp)
          }

          // Create the parsed event object
          const parsedEvent: ParsedFeeCollectedEvent = {
            token: parsedLog.args[0].toLowerCase(),
            integrator: parsedLog.args[1].toLowerCase(),
            integratorFee: BigNumber.from(parsedLog.args[2]),
            lifiFee: BigNumber.from(parsedLog.args[3]),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash.toLowerCase(),
            logIndex: event.logIndex,
            blockTimestamp,
          }

          parsedEvents.push(parsedEvent)
        }

        logger.debug('FeeCollector events parsed', {
          parsedCount: parsedEvents.length,
          uniqueBlocks: blockTimestampCache.size,
          cacheHitRatio: events.length > 0 
            ? `${Math.round((1 - blockTimestampCache.size / events.length) * 100)}%`
            : 'N/A',
        })

        return parsedEvents
      } catch (error: any) {
        // Handle NETWORK_ERROR by reinitializing the provider
        if (error.code === 'NETWORK_ERROR') {
          this.reinitializeProvider()
        }

        // Check if it's a rate limit error
        const rateLimitInfo = this.rateLimitHandler.analyzeError(error)
        
        if (rateLimitInfo.isRateLimit && this.rateLimitHandler.shouldRetry(retries)) {
          this.rateLimitHandler.logRateLimit(rateLimitInfo, { 
            operation: 'parseFeeCollectorEvents',
            eventCount: events.length,
          })
          
          // Wait for the specified delay or use exponential backoff
          const delay = rateLimitInfo.retryDelayMs || 
                       this.rateLimitHandler.calculateBackoffDelay(retries)
          
          logger.info(`Waiting ${Math.round(delay / 1000)}s before retrying...`, {
            operation: 'parseFeeCollectorEvents',
            attempt: retries + 1,
            maxRetries,
          })
          
          await new Promise(resolve => setTimeout(resolve, delay))
          retries++
          continue
        }

        // If it's not a rate limit error or we're out of retries
        logger.error('Error parsing FeeCollector events:', error)
        throw new Error(`Failed to parse events: ${error}`)
      }
    }

    throw new Error('Max retries exceeded while parsing events')
  }

  /**
   * Fetches and parses events in a single operation
   * Convenience method that combines loading and parsing
   * 
   * @param fromBlock - Starting block number
   * @param toBlock - Ending block number
   * @returns Array of parsed events
   */
  async fetchAndParseEvents(
    fromBlock: BlockTag,
    toBlock: BlockTag
  ): Promise<ParsedFeeCollectedEvent[]> {
    const rawEvents = await this.loadFeeCollectorEvents(fromBlock, toBlock)
    return this.parseFeeCollectorEvents(rawEvents)
  }

  /**
   * Validates that the RPC connection is working
   * Useful for health checks and initialization
   * 
   * @returns true if connection is successful
   * @throws Error if connection fails
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.provider.getNetwork()
      logger.info('Blockchain connection validated')
      return true
    } catch (error) {
      logger.error('Blockchain connection validation failed:', error)
      throw new Error(`Failed to validate blockchain connection: ${error}`)
    }
  }
}

