'use client';

import { useState, useEffect } from 'react';
import { WagmiProvider } from 'wagmi'
import { WagmiConfig, SupportedChainId } from './wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ConnectAndPay } from './connect-pay';
import { FiX } from "react-icons/fi";

export type CheckoutProps = {
  paymentEndpoint?: string
  orderHeaders?: Record<string, string>
  /* eslint-disable @typescript-eslint/no-explicit-any */
  orderData?: Record<string, any>
  // Custom callback (overrides paymentEndpoint if provided)
  onPaymentCreated?: (signatureData: string) => Promise<void>

  buttonHeight?: number
  buttonWidth?: number
  buttonText?: string
  buttonRadius?: string
  buttonBackgroundColor?: string
  displayMode?: 'light' | 'dark' | 'system'
  accentColor?: string
};

export function Checkout({
  paymentEndpoint,
  orderHeaders,
  orderData,
  onPaymentCreated,
  buttonHeight,
  buttonWidth,
  buttonText = 'Pay with Crypto',
  buttonRadius = '0.75rem',
  buttonBackgroundColor,
  displayMode = 'system',
  accentColor = '#338aea',
}: CheckoutProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // Handle system theme detection
  useEffect(() => {
    if (displayMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDark(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      setIsDark(displayMode === 'dark');
    }
  }, [displayMode]);

  // Generate hover color (darken accent by ~15%)
  const darkenColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `#${Math.floor(r * 0.85).toString(16).padStart(2, '0')}${Math.floor(g * 0.85).toString(16).padStart(2, '0')}${Math.floor(b * 0.85).toString(16).padStart(2, '0')}`;
  };

  const finalButtonColor = buttonBackgroundColor || accentColor;
  const hoverColor = darkenColor(finalButtonColor);

  return (
    <WagmiProvider config={WagmiConfig}>
      <QueryClientProvider client={new QueryClient()}>

        <button
          style={{
            borderRadius: buttonRadius,
            backgroundColor: finalButtonColor,
            padding: '0.5rem 1rem',
            color: 'white',
            marginBottom: '1rem',
            cursor: 'pointer',
            border: 'none',
            fontSize: '1.05rem',
            height: buttonHeight || 40,
            width: buttonWidth || 160,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverColor}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = finalButtonColor}
          onClick={() => {setIsOpen(true)}}>
          {buttonText}
        </button>

        <Dialog open={isOpen} as="div" style={{ position: 'relative', zIndex: 10 }} onClose={() => {setIsOpen(false)}}>
          <DialogBackdrop transition style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />

          <div style={{ position: 'fixed', inset: 0, zIndex: 10, width: '100vw', overflowY: 'auto' }}>
            <div style={{ display: 'flex', minHeight: '100%', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <DialogPanel
                transition
                style={{
                  width: '100%',
                  maxWidth: '28rem',
                  borderRadius: '0.75rem',
                  backgroundColor: isDark ? '#000000' : '#ffffff',
                  paddingTop: '1.65rem',
                  paddingBottom: '1.65rem',
                  paddingLeft: '2rem',
                  paddingRight: '2rem',
                  backdropFilter: 'blur(40px)',
                }}>

                <DialogTitle style={{ fontSize: '1.2rem', fontWeight: 500, color: isDark ? '#ffffff' : '#000000', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3>Pay With Crypto</h3>
                    <FiX
                      style={{ cursor: 'pointer', color: isDark ? '#ffffff' : '#000000' }}
                      size={20}
                      onClick={() => setIsOpen(false)}
                    />
                  </div>
                </DialogTitle>

                <ConnectAndPay
                  paymentEndpoint={paymentEndpoint}
                  orderHeaders={orderHeaders}
                  orderData={orderData}
                  onPaymentCreated={onPaymentCreated}
                  isDark={isDark}
                  accentColor={accentColor}
                />

              </DialogPanel>
            </div>
          </div>
        </Dialog>

      </QueryClientProvider>
    </WagmiProvider>
  );
}
