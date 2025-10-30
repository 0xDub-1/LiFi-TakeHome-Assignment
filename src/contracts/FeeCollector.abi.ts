/**
 * FeeCollector Contract ABI
 * 
 * This is the Application Binary Interface for the LI.FI FeeCollector contract.
 * We only include the FeesCollected event since that's all we need.
 * 
 * Contract address on Polygon: 0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9
 * 
 * Event signature:
 * FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)
 */

export const FeeCollectorABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: '_token',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: '_integrator',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: '_integratorFee',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: '_lifiFee',
        type: 'uint256',
      },
    ],
    name: 'FeesCollected',
    type: 'event',
  },
] as const

