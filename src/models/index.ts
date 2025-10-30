import { getModelForClass } from '@typegoose/typegoose'
import { FeeCollectedEvent } from './FeeCollectedEvent'
import { ScanProgress } from './ScanProgress'

/**
 * Export Typegoose models for use throughout the application
 * 
 * These are the actual Mongoose models that we'll use to interact with MongoDB
 */
export const FeeCollectedEventModel = getModelForClass(FeeCollectedEvent)
export const ScanProgressModel = getModelForClass(ScanProgress)

// Also export the classes for type definitions
export { FeeCollectedEvent, ScanProgress }

