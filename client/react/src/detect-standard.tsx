import { useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { SupportedChainId } from './wagmi';

// Extended ABI with EIP-2612 and ERC-3009 functions
const extendedTokenAbi = [
  ...erc20Abi,
  // EIP-2612 Permit
  {
    name: 'permit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' }
    ],
    outputs: []
  },
  {
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'DOMAIN_SEPARATOR',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }]
  },
  // ERC-3009 TransferWithAuthorization
  {
    name: 'receiveWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' }
    ],
    outputs: []
  }
] as const;

/**
 * Hook to check if a token supports ERC-3009 (TransferWithAuthorization)
 * Used to validate that the provided token can be used for gasless payments
 */
export function useIsERC3009Token(
  tokenAddress: `0x${string}` | undefined,
  chainId: SupportedChainId | undefined
): { isSupported: boolean; isLoading: boolean } {

  // Check for ERC-3009 by trying to call authorizationState
  // This is a view function in ERC-3009 tokens
  const { data: authStateResult, isLoading, isError } = useReadContract({
    address: tokenAddress,
    abi: [
      {
        name: 'authorizationState',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'authorizer', type: 'address' },
          { name: 'nonce', type: 'bytes32' }
        ],
        outputs: [{ name: '', type: 'bool' }]
      }
    ] as const,
    functionName: 'authorizationState',
    args: [
      '0x0000000000000000000000000000000000000000' as `0x${string}`,
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
    ],
    chainId: chainId,
    query: {
      retry: false,
      enabled: !!tokenAddress && !!chainId, // Only run when both are defined
    }
  });

  return {
    isSupported: !isError && authStateResult !== undefined,
    isLoading
  };
}

export { extendedTokenAbi };
