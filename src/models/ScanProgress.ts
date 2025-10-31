import { prop, index, modelOptions } from '@typegoose/typegoose'
import { Types } from 'mongoose'

/**
 * Model to track scanning progress for each blockchain
 * Ensures efficient scanning by remembering the last processed block
 */
@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'scan_progress',
  },
})
@index({ chain: 1 }, { unique: true })  // Only one progress record per chain
export class ScanProgress {
  _id!: Types.ObjectId

  /**
   * The blockchain identifier
   * @example 'polygon', 'ethereum', 'arbitrum'
   */
  @prop({ required: true, type: String })
  public chain!: string

  /**
   * The last block number that was successfully scanned
   */
  @prop({ required: true, type: Number })
  public lastScannedBlock!: number

  /**
   * The latest block number known on the chain (for progress tracking)
   */
  @prop({ required: false, type: Number })
  public latestBlockNumber?: number

  /**
   * Timestamp of the last successful scan
   */
  @prop({ required: true, type: Date, default: () => new Date() })
  public lastScanTimestamp!: Date

  /**
   * Status of the scanner
   */
  @prop({
    required: true,
    type: String,
    enum: ['idle', 'scanning', 'error'],
    default: 'idle',
  })
  public status!: 'idle' | 'scanning' | 'error'

  /**
   * Error message if the scanner encountered an error
   */
  @prop({ required: false, type: String })
  public lastError?: string

  /**
   * Timestamps managed by Mongoose
   */
  public createdAt!: Date
  public updatedAt!: Date
}

