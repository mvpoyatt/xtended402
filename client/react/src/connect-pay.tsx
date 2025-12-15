'use client';

import { useEffect, useState } from 'react';
import { erc20Abi } from 'viem'
import { useConnection, useSwitchChain, useReadContract, useWalletClient } from 'wagmi'
import { SupportedChainId } from './wagmi';
import { WalletOptions } from './wallet-options';
import { CreateSignature } from './create-signature';
import { useIsERC3009Token } from './detect-standard';

export type ConnectAndPayProps = {
  paymentEndpoint?: string
  orderHeaders?: Record<string, string>
  /* eslint-disable @typescript-eslint/no-explicit-any */
  orderData?: Record<string, any>
  // Custom callback (overrides paymentEndpoint if provided)
  onPaymentCreated?: (signatureData: string) => Promise<void>
  isDark: boolean
  accentColor: string
};

const supportedChainIds = [
  1, 10, 11155111, 8453, 84532, 11155420, 42161, 421614, 137, 80002, 43114, 43113, 59144, 59141, 324, 300
] as const;

function isSupportedChainId(value: number): value is SupportedChainId {
  return supportedChainIds.includes(value as SupportedChainId);
}

export function ConnectAndPay({
  paymentEndpoint,
  orderHeaders,
  orderData,
  onPaymentCreated,
  isDark,
  accentColor,
}: ConnectAndPayProps) {
  const [paymentResponse, setPaymentResponse] = useState<{
    success: boolean;
    message: string;
    orderId?: string;
    transaction?: string;
  } | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const [network, setNetwork] = useState<string>('');
  const [chainId, setChainId] = useState<SupportedChainId>();
  const [isChainSupported, setIsChainSupported] = useState<boolean>(false);
  const [tokenAddress, setTokenAddress] = useState<`0x${string}`>();
  const [recipientAddress, setRecipientAddress] = useState<`0x${string}`>();
  const [amount, setAmount] = useState<string | null>(null);
  const [isDiscoveringAccepts, setIsDiscoveringAccepts] = useState(false);
  const { isConnected, chain, address } = useConnection()
  const switchChain = useSwitchChain()
  const { data: walletClient } = useWalletClient({ chainId })

  useEffect(() => {
    if (isConnected && chain?.id !== chainId && chainId) {
      switchChain.mutate({ chainId })
    }
  }, [isConnected, chain?.id, chainId, switchChain])

  // Price discovery on component load
  useEffect(() => {
    const discoverAccepts = async () => {
      if (!paymentEndpoint || !orderData) return;

      setIsDiscoveringAccepts(true);
      try {
        const discoveryResponse = await fetch(paymentEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(orderHeaders || {})
          },
          body: JSON.stringify(orderData)
        });

        if (discoveryResponse.status === 402) {
          // Read payment requirements from PAYMENT-REQUIRED header
          const paymentRequiredHeader = discoveryResponse.headers.get('PAYMENT-REQUIRED');
          if (paymentRequiredHeader) {
            // Decode base64 header
            const paymentReq = JSON.parse(atob(paymentRequiredHeader));
            const accepts = paymentReq.accepts;
            if (!accepts || accepts.length === 0) {
              throw new Error('No accepted payment methods found in PAYMENT-REQUIRED header');
            }

            // For simplicity, pick the first accepted method
            const network = accepts[0].network;  // "eip155:84532"

            const parsedChainId = parseInt(network.split(':')[1]);  // 84532
            if (!isSupportedChainId(parsedChainId)) {
              console.error('Unsupported chain ID from payment discovery:', parsedChainId);
              setIsChainSupported(false);
              return;
            } else {
              setIsChainSupported(true);
            }

            const chainId = parsedChainId as SupportedChainId;
            const tokenAddress = accepts[0].asset;
            const recipientAddress = accepts[0].payTo;
            const amount = accepts[0].amount;

            setNetwork(network);
            setChainId(chainId);
            setTokenAddress(tokenAddress);
            setRecipientAddress(recipientAddress);
            setAmount(amount);
          }
        }
      } catch (error) {
        console.error('Price discovery failed:', error);
      } finally {
        setIsDiscoveringAccepts(false);
      }
    };

    discoverAccepts();
  }, [paymentEndpoint, orderData, orderHeaders])

  // Validate token supports ERC-3009
  const { isSupported: isERC3009, isLoading: isCheckingToken } = useIsERC3009Token(
    tokenAddress,
    chainId
  )

  // Get token metadata for display
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'symbol',
    chainId: chainId,
    query: { enabled: !!tokenAddress && !!chainId }
  })

  const { data: tokenName } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'name',
    chainId: chainId,
    query: { enabled: !!tokenAddress && !!chainId }
  })

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: !!tokenAddress && !!chainId }
  })

  // Try to read version from token contract (EIP-712 domain)
  const { data: tokenVersion } = useReadContract({
    address: tokenAddress,
    abi: [
      {
        name: 'version',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'string' }],
      },
    ],
    functionName: 'version',
    chainId: chainId,
    query: {
      retry: false, // Don't retry if version() doesn't exist
      enabled: !!tokenAddress && !!chainId
    }
  })

  // Convert smallest unit to human-readable for display
  const displayAmount = amount && tokenDecimals !== undefined && tokenDecimals !== null
    ? (Number(amount) / Math.pow(10, Number(tokenDecimals))).toFixed(Math.min(Number(tokenDecimals), 6))
    : amount || '...';

  const handlePay = async () => {
    if (
      !isConnected || !address || !walletClient || !tokenName || !amount || !network || !chainId || !tokenAddress || !recipientAddress
    ) {
      console.error('Missing required data for payment');
      return;
    }

    if (paymentResponse && !paymentResponse.success) {
      setPaymentResponse(null); // Clear previous error
      return;
    }

    setProcessingPayment(true);

    try {
      // Create signature with discovered amount
      const signatureData = await CreateSignature(
        walletClient,
        address,
        recipientAddress,
        tokenAddress,
        amount,
        network,
        chainId,
        tokenName as string,
        (tokenVersion as string) || '2'
      );

      // Send payment with PAYMENT-SIGNATURE header
      if (onPaymentCreated) {
        await onPaymentCreated(signatureData);
      } else if (paymentEndpoint) {
        const response = await fetch(paymentEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'PAYMENT-SIGNATURE': signatureData,
            ...(orderHeaders || {})
          },
          body: orderData ? JSON.stringify(orderData) : undefined
        });

        if (!response.ok) {
          let errorMessage = response.statusText;

          // Check for error in PAYMENT-REQUIRED header (v2 format)
          if (response.status === 402) {
            const paymentRequiredHeader = response.headers.get('PAYMENT-REQUIRED');
            if (paymentRequiredHeader) {
              try {
                const paymentReq = JSON.parse(atob(paymentRequiredHeader));
                // Prefer details over error for more specific information
                if (paymentReq.details) {
                  errorMessage = paymentReq.details;
                } else if (paymentReq.error) {
                  errorMessage = paymentReq.error;
                }
              } catch (e) {
                console.warn('Failed to parse PAYMENT-REQUIRED header:', e);
              }
            }
          }

          // Fallback to body if no header error found
          if (errorMessage === response.statusText) {
            try {
              const errorText = await response.text();
              const errorJson = JSON.parse(errorText);
              // Prefer details over error for more specific information
              if (errorJson.details) {
                errorMessage = errorJson.details;
              } else if (errorJson.error) {
                errorMessage = errorJson.error;
              }
            } catch {
              // Use statusText as fallback
            }
          }

          console.warn('Payment endpoint error:', errorMessage);
          setPaymentResponse({ success: false, message: errorMessage });
        } else {
          const responseData = await response.json();
          console.log('Payment processed successfully:', responseData);
          setPaymentResponse({
            success: true,
            message: 'Payment successful',
            orderId: responseData.orderId,
            transaction: responseData.transaction
          });
        }
      } else {
        console.log('Payment signature created:', signatureData);
        console.warn('No payment handler provided. Pass onPaymentCreated or paymentEndpoint to handle payment.');
      }

    } catch (error) {
      console.error('Payment failed:', error);
      setPaymentResponse({ success: false, message: (error as Error).message || 'Payment failed' });
    } finally {
      setProcessingPayment(false);
    }
  }

  // Show error if token doesn't support ERC-3009
  if (!isDiscoveringAccepts && !isCheckingToken && !isERC3009 && tokenAddress) {
    return (
      <div style={{ padding: '1rem', backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '0.5rem' }}>
        <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Unsupported Token</h3>
        <p style={{ fontSize: '0.875rem' }}>
          This token does not support ERC-3009 gasless transfers.
        </p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Token: {tokenAddress}
        </p>
      </div>
    );
  }

  // Show error if chain is unsupported
  if (chainId && !isChainSupported) {
    return (
      <div style={{ padding: '1rem', backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '0.5rem' }}>
        <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Unsupported Network</h3>
        <p style={{ fontSize: '0.875rem' }}>
          The selected network is not supported by this application.
        </p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Chain ID: {chainId}
        </p>
      </div>
    );
  }

  const darkenColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `#${Math.floor(r * 0.85).toString(16).padStart(2, '0')}${Math.floor(g * 0.85).toString(16).padStart(2, '0')}${Math.floor(b * 0.85).toString(16).padStart(2, '0')}`;
  };

  return (
    <>
      <div style={{ height: '12rem', overflowY: 'auto' }}>
        { !paymentResponse && !processingPayment &&
          <WalletOptions
            chainId={chainId}
            tokenAddress={tokenAddress}
            isDark={isDark}
            accentColor={accentColor}
          />
        }

        { paymentResponse && !paymentResponse.success && !processingPayment &&
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: isDark ? '#3f3f46' : '#fef2f2',
            color: isDark ? '#fca5a5' : '#991b1b',
            border: isDark ? '1px solid #52525b' : '1px solid #fecaca'
          }}>
            <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Payment Error</h3>
            <p>{paymentResponse.message}</p>
          </div>
        }

        { paymentResponse && paymentResponse.success && !processingPayment &&
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: isDark ? '#064e3b' : '#ecfdf5',
            color: isDark ? '#a7f3d0' : '#065f46',
            border: isDark ? '1px solid #10b981' : '1px solid #a7f3d0'
          }}>
            <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Payment Successful</h3>
            <p>Your payment has been processed successfully.</p>
            {paymentResponse.orderId && (
              <p style={{ marginTop: '0.5rem' }}>
                Order ID: {paymentResponse.orderId}
              </p>
            )}
            {paymentResponse.transaction && (
              <p style={{ marginTop: '0.25rem', wordBreak: 'break-all' }}>
                Transaction: {paymentResponse.transaction}
              </p>
            )}
          </div>
        }

        { processingPayment &&
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '8rem',
            paddingBottom: '2rem'
          }}>
            <LoadingSpinner accentColor={accentColor} size={48} />
          </div>
        }
      </div>

      { !paymentResponse && <button
        disabled={!isConnected || (chain?.id !== chainId) || isCheckingToken || processingPayment || isDiscoveringAccepts || !amount}
        style={{
          width: '100%',
          marginTop: '1.25rem',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          backgroundColor: isHoveringButton ? darkenColor(accentColor) : accentColor,
          color: 'white',
          opacity: (!isConnected || (chain?.id !== chainId) || isCheckingToken || isDiscoveringAccepts || !amount) ? 0.5 : 1,
          cursor: isHoveringButton ? 'pointer' : 'default'
        }}
        onMouseEnter={() => setIsHoveringButton(true)}
        onMouseLeave={() => setIsHoveringButton(false)}
        onClick={() => { handlePay() }}>
        {isCheckingToken ? 'Validating token...' : isDiscoveringAccepts ? 'Loading price...' : `Purchase for ${displayAmount} ${tokenSymbol || '...'}`}
      </button> }

      { paymentResponse && !paymentResponse.success && !processingPayment && <button
        disabled={!isConnected || (chain?.id !== chainId) || isCheckingToken}
        style={{
          width: '100%',
          marginTop: '1.25rem',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          backgroundColor: isHoveringButton ? darkenColor(accentColor) : accentColor,
          color: 'white',
          opacity: (!isConnected || (chain?.id !== chainId) || isCheckingToken) ? 0.5 : 1,
          cursor: isHoveringButton ? 'pointer' : 'default'
        }}
        onMouseEnter={() => setIsHoveringButton(true)}
        onMouseLeave={() => setIsHoveringButton(false)}
        onClick={() => { handlePay() }}>
        Try Again
      </button> }
    </>
  )
}

interface LoadingSpinnerProps {
  accentColor: string;
  size?: number;
}

function LoadingSpinner({ accentColor, size = 32 }: LoadingSpinnerProps) {
  return (
    <div role="status">
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .spinner-svg {
          animation: spin 1s linear infinite;
        }
      `}</style>
      <svg
        aria-hidden="true"
        className="spinner-svg"
        style={{ width: `${size}px`, height: `${size}px` }}
        viewBox="0 0 100 101"
        fill="none"
        xmlns="http://www.w3.org/2000/svg">
        <path
          d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
          fill={`${accentColor}33`}
        />
        <path
          d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
          fill={accentColor}
        />
      </svg>
      <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
        Loading...
      </span>
    </div>
  );
}
