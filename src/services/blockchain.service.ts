import { BigNumber, ethers } from 'ethers'
import { BlockTag } from '@ethersproject/abstract-provider'
import { FeeCollectorABI } from '../contracts/FeeCollector.abi'
import { logger } from '../utils/logger'

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
 */
export class BlockchainService {
  private readonly provider: ethers.providers.JsonRpcProvider
  private readonly contract: ethers.Contract
  private readonly contractAddress: string

  /**
   * Creates a new BlockchainService instance
   * 
   * @param rpcUrl - The RPC endpoint URL (e.g., https://polygon-rpc.com)
   * @param contractAddress - The FeeCollector contract address
   */
  constructor(rpcUrl: string, contractAddress: string) {
    this.contractAddress = contractAddress
    
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
   * Gets the current block number from the blockchain
   * 
   * @returns The latest block number
   * @throws Error if unable to fetch block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    try {
      const blockNumber = await this.provider.getBlockNumber()
      logger.debug('Current block number fetched', { blockNumber })
      return blockNumber
    } catch (error) {
      logger.error('Error fetching current block number:', error)
      throw new Error(`Failed to fetch current block number: ${error}`)
    }
  }

  /**
   * Loads FeesCollected events for a given block range
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
    } catch (error) {
      logger.error('Error loading FeeCollector events:', {
        error,
        fromBlock,
        toBlock,
      })
      throw new Error(`Failed to load events from ${fromBlock} to ${toBlock}: ${error}`)
    }
  }

  /**
   * Parses raw ethers events into structured ParsedFeeCollectedEvent objects
   * Enriches events with block timestamp information
   * 
   * @param events - Array of raw ethers events
   * @returns Array of parsed events with additional metadata
   * @throws Error if parsing fails
   */
  async parseFeeCollectorEvents(events: ethers.Event[]): Promise<ParsedFeeCollectedEvent[]> {
    try {
      logger.debug('Parsing FeeCollector events', { eventCount: events.length })

      const parsedEvents: ParsedFeeCollectedEvent[] = []

      for (const event of events) {
        // Parse the event using the contract interface
        const parsedLog = this.contract.interface.parseLog(event)

        // Fetch block information to get the timestamp
        const block = await this.provider.getBlock(event.blockNumber)

        if (!block) {
          logger.warn('Block not found for event', {
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
          })
          continue
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
          blockTimestamp: new Date(block.timestamp * 1000), // Convert Unix timestamp to Date
        }

        parsedEvents.push(parsedEvent)
      }

      logger.debug('FeeCollector events parsed', {
        parsedCount: parsedEvents.length,
      })

      return parsedEvents
    } catch (error) {
      logger.error('Error parsing FeeCollector events:', error)
      throw new Error(`Failed to parse events: ${error}`)
    }
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

