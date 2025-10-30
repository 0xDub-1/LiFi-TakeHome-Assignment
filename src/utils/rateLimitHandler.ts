import { logger } from './logger'

/**
 * Rate limit error information
 */
export interface RateLimitInfo {
  isRateLimit: boolean
  retryDelayMs: number | null
  retryMinutes: number | null
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  useExponentialBackoff?: boolean
}

/**
 * Service for handling rate limits and retry logic
 * 
 * This service provides:
 * - Detection of rate limit errors from various sources
 * - Parsing of retry delays from error messages
 * - Exponential backoff for generic errors
 * - Centralized retry logic
 */
export class RateLimitHandler {
  private readonly defaultRetryDelayMs: number = 5 * 60 * 1000 // 5 minutes

  constructor(private readonly strategy: RetryStrategy = {}) {
    this.strategy = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 5 * 60 * 1000, // 5 minutes max
      useExponentialBackoff: true,
      ...strategy,
    }
  }

  /**
   * Analyzes an error to determine if it's a rate limit error and extracts retry information
   * 
   * @param error - The error to analyze
   * @returns Rate limit information including retry delay
   */
  analyzeError(error: unknown): RateLimitInfo {
    const errorMessage = this.extractErrorMessage(error)

    // Check if this is a rate limit error
    if (!this.isRateLimitError(errorMessage)) {
      return {
        isRateLimit: false,
        retryDelayMs: null,
        retryMinutes: null,
      }
    }

    // Extract retry delay from error message
    const retryDelayMs = this.parseRetryDelay(errorMessage)

    return {
      isRateLimit: true,
      retryDelayMs,
      retryMinutes: retryDelayMs ? Math.ceil(retryDelayMs / 60000) : null,
    }
  }

  /**
   * Checks if an error is a rate limit error
   * 
   * @param errorMessage - The error message to check
   * @returns true if this is a rate limit error
   */
  private isRateLimitError(errorMessage: string): boolean {
    const rateLimitPatterns = [
      /rate limit/i,
      /too many requests/i,
      /throttle/i,
      /quota exceeded/i,
      /429/i, // HTTP 429 Too Many Requests
      /code.*-32090/i, // JSON-RPC rate limit error code
    ]

    return rateLimitPatterns.some(pattern => pattern.test(errorMessage))
  }

  /**
   * Parses retry delay from error message
   * Supports various formats:
   * - "retry in 10m0s"
   * - "retry in 5m"
   * - "retry in 30s"
   * - "retry after 300 seconds"
   * 
   * @param errorMessage - The error message to parse
   * @returns Retry delay in milliseconds, or default if not parseable
   */
  private parseRetryDelay(errorMessage: string): number {
    // Pattern 1: "retry in 10m0s", "retry in 5m30s"
    const timePattern1 = /retry in (\d+)m(\d+)s/i
    const match1 = errorMessage.match(timePattern1)
    if (match1) {
      const minutes = parseInt(match1[1], 10)
      const seconds = parseInt(match1[2], 10)
      return (minutes * 60 + seconds) * 1000
    }

    // Pattern 2: "retry in 5m"
    const timePattern2 = /retry in (\d+)m/i
    const match2 = errorMessage.match(timePattern2)
    if (match2) {
      const minutes = parseInt(match2[1], 10)
      return minutes * 60 * 1000
    }

    // Pattern 3: "retry in 30s"
    const timePattern3 = /retry in (\d+)s/i
    const match3 = errorMessage.match(timePattern3)
    if (match3) {
      const seconds = parseInt(match3[1], 10)
      return seconds * 1000
    }

    // Pattern 4: "retry after 300 seconds"
    const timePattern4 = /retry after (\d+) seconds?/i
    const match4 = errorMessage.match(timePattern4)
    if (match4) {
      const seconds = parseInt(match4[1], 10)
      return seconds * 1000
    }

    // Pattern 5: Retry-After header format (seconds)
    const timePattern5 = /retry-after:\s*(\d+)/i
    const match5 = errorMessage.match(timePattern5)
    if (match5) {
      const seconds = parseInt(match5[1], 10)
      return seconds * 1000
    }

    // If we can't parse, return default
    logger.warn('Could not parse retry delay from rate limit error, using default', {
      errorMessage: errorMessage.substring(0, 200),
      defaultDelayMs: this.defaultRetryDelayMs,
    })

    return this.defaultRetryDelayMs
  }

  /**
   * Extracts error message from various error types
   * 
   * @param error - The error object
   * @returns Error message as string
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    if (error && typeof error === 'object') {
      // Try to extract message from object
      const errorObj = error as Record<string, unknown>
      if (errorObj.message) {
        return String(errorObj.message)
      }
      if (errorObj.reason) {
        return String(errorObj.reason)
      }
      // Try to stringify the whole object
      try {
        return JSON.stringify(error)
      } catch {
        return String(error)
      }
    }
    return String(error)
  }

  /**
   * Calculates delay for exponential backoff
   * 
   * @param attemptNumber - The retry attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  calculateBackoffDelay(attemptNumber: number): number {
    if (!this.strategy.useExponentialBackoff) {
      return this.strategy.baseDelayMs || 1000
    }

    // Exponential backoff: baseDelay * 2^attempt
    const baseDelay = this.strategy.baseDelayMs || 1000
    const delay = baseDelay * Math.pow(2, attemptNumber)

    // Cap at maxDelay
    const maxDelay = this.strategy.maxDelayMs || 5 * 60 * 1000
    return Math.min(delay, maxDelay)
  }

  /**
   * Logs rate limit information
   * 
   * @param rateLimitInfo - The rate limit information
   * @param context - Additional context for logging
   */
  logRateLimit(rateLimitInfo: RateLimitInfo, context: Record<string, unknown> = {}): void {
    if (!rateLimitInfo.isRateLimit) {
      return
    }

    logger.warn('Rate limit detected', {
      retryDelayMs: rateLimitInfo.retryDelayMs,
      retryMinutes: rateLimitInfo.retryMinutes,
      ...context,
    })

    // Also log to console for visibility
    const minutes = rateLimitInfo.retryMinutes || Math.ceil((rateLimitInfo.retryDelayMs || 0) / 60000)
    console.log(`\n⚠️  Rate limit reached! Waiting ${minutes} minutes before retrying...\n`)
  }

  /**
   * Checks if we should retry based on attempt number
   * 
   * @param attemptNumber - Current attempt number (0-indexed)
   * @returns true if we should retry
   */
  shouldRetry(attemptNumber: number): boolean {
    const maxRetries = this.strategy.maxRetries || 3
    return attemptNumber < maxRetries
  }
}

// Export a default instance for convenience
export const defaultRateLimitHandler = new RateLimitHandler()

