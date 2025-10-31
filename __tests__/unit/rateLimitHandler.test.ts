import { RateLimitHandler } from '../../src/utils/rateLimitHandler'

describe('RateLimitHandler', () => {
  let handler: RateLimitHandler

  beforeEach(() => {
    handler = new RateLimitHandler()
  })

  describe('analyzeError', () => {
    it('should detect rate limit error with "Too many requests"', () => {
      const error = new Error('Too many requests, reason: call rate limit exhausted, retry in 10m0s')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
      expect(result.retryDelayMs).toBe(600000) // 10 minutes in ms
      expect(result.retryMinutes).toBe(10)
    })

    it('should detect rate limit error with "rate limit"', () => {
      const error = new Error('rate limit exceeded, retry in 5m30s')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
      expect(result.retryDelayMs).toBe(330000) // 5m 30s in ms
      expect(result.retryMinutes).toBe(6) // Rounded up
    })

    it('should parse "retry in 5m" format', () => {
      const error = new Error('rate limit, retry in 5m')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
      expect(result.retryDelayMs).toBe(300000) // 5 minutes
    })

    it('should parse "retry in 30s" format', () => {
      const error = new Error('rate limit, retry in 30s')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
      expect(result.retryDelayMs).toBe(30000) // 30 seconds
    })

    it('should parse "retry after X seconds" format', () => {
      const error = new Error('throttled, retry after 120 seconds')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
      expect(result.retryDelayMs).toBe(120000) // 120 seconds
    })

    it('should handle HTTP 429 errors', () => {
      const error = new Error('HTTP 429: Too many requests')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
      expect(result.retryDelayMs).toBeGreaterThan(0)
    })

    it('should handle JSON-RPC rate limit error code', () => {
      const error = new Error('code: -32090, message: rate limit')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
    })

    it('should not detect rate limit for regular errors', () => {
      const error = new Error('Connection timeout')
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(false)
      expect(result.retryDelayMs).toBeNull()
      expect(result.retryMinutes).toBeNull()
    })

    it('should handle string errors', () => {
      const error = 'Too many requests, retry in 2m'
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
      expect(result.retryDelayMs).toBe(120000)
    })

    it('should handle error objects without message property', () => {
      const error = { reason: 'rate limit exceeded' }
      const result = handler.analyzeError(error)

      expect(result.isRateLimit).toBe(true)
    })
  })

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const handler = new RateLimitHandler({
        baseDelayMs: 1000,
        useExponentialBackoff: true,
      })

      expect(handler.calculateBackoffDelay(0)).toBe(1000) // 1s * 2^0
      expect(handler.calculateBackoffDelay(1)).toBe(2000) // 1s * 2^1
      expect(handler.calculateBackoffDelay(2)).toBe(4000) // 1s * 2^2
      expect(handler.calculateBackoffDelay(3)).toBe(8000) // 1s * 2^3
    })

    it('should respect maxDelay cap', () => {
      const handler = new RateLimitHandler({
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        useExponentialBackoff: true,
      })

      expect(handler.calculateBackoffDelay(10)).toBe(5000) // Capped at 5s
    })

    it('should return baseDelay when exponential backoff is disabled', () => {
      const handler = new RateLimitHandler({
        baseDelayMs: 2000,
        useExponentialBackoff: false,
      })

      expect(handler.calculateBackoffDelay(0)).toBe(2000)
      expect(handler.calculateBackoffDelay(5)).toBe(2000)
      expect(handler.calculateBackoffDelay(10)).toBe(2000)
    })
  })

  describe('shouldRetry', () => {
    it('should allow retries within maxRetries', () => {
      const handler = new RateLimitHandler({ maxRetries: 3 })

      expect(handler.shouldRetry(0)).toBe(true)
      expect(handler.shouldRetry(1)).toBe(true)
      expect(handler.shouldRetry(2)).toBe(true)
    })

    it('should not allow retries after maxRetries', () => {
      const handler = new RateLimitHandler({ maxRetries: 3 })

      expect(handler.shouldRetry(3)).toBe(false)
      expect(handler.shouldRetry(4)).toBe(false)
    })
  })

  describe('logRateLimit', () => {
    it('should not log if not a rate limit error', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

      handler.logRateLimit({
        isRateLimit: false,
        retryDelayMs: null,
        retryMinutes: null,
      })

      expect(consoleLogSpy).not.toHaveBeenCalled()

      consoleLogSpy.mockRestore()
    })

    it('should log rate limit information', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

      handler.logRateLimit({
        isRateLimit: true,
        retryDelayMs: 600000,
        retryMinutes: 10,
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('10 minutes')
      )

      consoleLogSpy.mockRestore()
    })
  })
})

