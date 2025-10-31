import winston from 'winston'
import { config } from '../config'

/**
 * Centralized logging utility using Winston
 * Provides structured logging with different levels and formatters
 */
export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'lifi-fee-collector-scanner' },
  transports: [
    // Write all logs with level 'error' or less to error.log
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Write all logs to combined.log
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})

// Always log to console for Docker/production environments
// Docker captures stdout/stderr, making logs visible via docker-compose logs
// Files are still written for persistence within the container
logger.add(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
        return `${timestamp} [${level}]: ${message} ${metaStr}`
      })
    ),
  })
)

