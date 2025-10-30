import { prop, index, modelOptions } from '@typegoose/typegoose'
import { Types } from 'mongoose'

/**
 * Model representing a FeesCollected event from the FeeCollector smart contract
 * Events are indexed by integrator and blockNumber for efficient querying
 */
@modelOptions({
  schemaOptions: {
    timestamps: true,                    // Adds createdAt and updatedAt automatically
    collection: 'fee_collected_events',  // Name of the MongoDB collection
  },
})
@index({ integrator: 1 })                      // Index for fast queries by integrator
@index({ blockNumber: 1 })                     // Index for fast queries by block number
@index({ transactionHash: 1, logIndex: 1 }, { unique: true })  // Unique constraint
@index({ chain: 1, blockNumber: 1 })           // Composite index for chain + block
export class FeeCollectedEvent {
  // MongoDB automatically creates _id, but we declare it for TypeScript
  _id!: Types.ObjectId

  /**
   * The blockchain where this event was emitted
   * @example 'polygon', 'ethereum', 'arbitrum'
   */
  @prop({ required: true, type: String })
  public chain!: string

  /**
   * The address of the token that was collected
   */
  @prop({ required: true, type: String, lowercase: true })
  public token!: string

  /**
   * The integrator address that triggered the fee collection
   */
  @prop({ required: true, type: String, lowercase: true })
  public integrator!: string

  /**
   * The fee amount collected for the integrator (stored as string to preserve precision)
   */
  @prop({ required: true, type: String })
  public integratorFee!: string

  /**
   * The fee amount collected for LI.FI (stored as string to preserve precision)
   */
  @prop({ required: true, type: String })
  public lifiFee!: string

  /**
   * The block number where this event was emitted
   */
  @prop({ required: true, type: Number })
  public blockNumber!: number

  /**
   * The transaction hash where this event was emitted
   */
  @prop({ required: true, type: String, lowercase: true })
  public transactionHash!: string

  /**
   * The log index within the transaction
   */
  @prop({ required: true, type: Number })
  public logIndex!: number

  /**
   * The block timestamp
   */
  @prop({ required: true, type: Date })
  public blockTimestamp!: Date

  /**
   * Timestamps managed by Mongoose (added because timestamps: true)
   */
  public createdAt!: Date
  public updatedAt!: Date
}

