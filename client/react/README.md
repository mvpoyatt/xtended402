# @xtended402/react

React payment component for xtended402. One example of a client implementation that provides a complete payment flow with automatic price discovery, wallet connection, token validation, and signature creation.

## Installation

```bash
npm install @xtended402/react
```

## Basic Usage

```tsx
import { Checkout } from '@xtended402/react';

export default function CheckoutPage() {
  return (
    <Checkout
      // Backend endpoint
      paymentEndpoint="/api/purchase"

      // Order data (sent in request body)
      orderData={{
        customerEmail: "customer@example.com",
        items: [
          {
            productCode: "TSH-001",
            productName: "T-Shirt",
            quantity: 2,
            size: "L"
          }
        ]
      }}

      // Optional: UI customization
      displayMode="system"
      accentColor="#10b981"
    />
  );
}
```

## How It Works

1. **Payment Discovery** (automatic on load): Component sends order data to backend, receives 402 response with payment requirements (chain, token, recipient, amount) from x402 v2 PAYMENT-REQUIRED header
2. **Token Validation**: Component checks contract on-chain to ensure it supports ERC-3009 (Transfer with Authorization)
3. **User Interaction**: User connects wallet to the discovered network, clicks Purchase button, signs EIP-712 payment authorization
4. **Payment**: Component sends signed authorization via PAYMENT-SIGNATURE header with order data in body
5. **Backend Processing**: xtended402 middleware verifies signature, settles payment on-chain, and processes order
6. **Success Display**: If backend returns `orderId` and `transaction` in response, they're displayed to user

The component is server-authoritative - your backend controls all payment requirements (which chain, token, recipient, and amount). This makes it secure and flexible.

See the [Go middleware documentation](https://github.com/mvpoyatt/xtended402/tree/main/server/go) for backend implementation.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `paymentEndpoint` | `string` | Yes* | Backend endpoint for payment discovery and processing |
| `orderData` | `object` | No | Custom data sent in request body (e.g., cart items, customer info) |
| `orderHeaders` | `object` | No | Custom headers (e.g., auth tokens) |
| `onPaymentCreated` | `function` | Yes* | Alternative to built-in submission - callback receives signature data |
| `buttonHeight` | `number` | No | Button height in pixels (default: 40) |
| `buttonWidth` | `number` | No | Button width in pixels (default: 160) |
| `buttonText` | `string` | No | Custom button text (default: 'Pay with Crypto') |
| `buttonRadius` | `string` | No | Button border radius (default: '0.75rem') |
| `buttonBackgroundColor` | `string` | No | Button background color, overrides `accentColor` for button only |
| `displayMode` | `'light' \| 'dark' \| 'system'` | No | Theme mode (default: 'system'). 'system' follows OS preference |
| `accentColor` | `string` | No | Hex color for accents like spinner and borders (default: '#338aea') |

*`paymentEndpoint` is required for payment discovery. `onPaymentCreated` is optional - if provided, it replaces the built-in submission with your custom handler.

## Theming

```tsx
<Checkout
  // ... other props
  displayMode="system"           // Auto-detects OS theme
  accentColor="#10b981"          // Custom accent color for spinner, borders
  buttonText="Buy Now"           // Custom button text
  buttonRadius="0.5rem"          // Custom button border radius
  buttonBackgroundColor="#9333ea" // Custom button color (overrides accentColor)
/>
```

### Theme Options

- **displayMode**: `'light'`, `'dark'`, or `'system'` (follows OS preference)
- **accentColor**: Hex color for spinner, borders, and other accent elements
- **buttonBackgroundColor**: Hex color specifically for the button (if not provided, uses `accentColor`)
- **buttonText**: Customize button text to match your use case
- **buttonRadius**: Adjust button roundness with any CSS border-radius value

## Backend Integration

This component implements the x402 v2 payment protocol with automatic payment discovery:

1. **Discovery Request** (on load): Component sends order data to `paymentEndpoint`
2. **402 Response**: Backend returns PAYMENT-REQUIRED header with payment requirements:
   - `network`: Chain in CAIP-2 format (e.g., "eip155:84532")
   - `asset`: Token contract address
   - `amount`: Payment amount in smallest token units
   - `payTo`: Recipient address
3. **Payment Request** (after user signs): Component sends PAYMENT-SIGNATURE header with order data
4. **Success Response**: Backend processes payment and returns result. Include `orderId` and `transaction` fields in the response body to display them to the user

Your xtended402 middleware handles both requests automatically. See the [backend implementation guide](https://github.com/mvpoyatt/xtended402/tree/main/server/go).

## Current Payment Methods

This React component currently supports ERC-3009 tokens (tokens with `transferWithAuthorization`):
- USDC (all supported networks)
- EURC
- Other ERC-3009 compliant tokens

The component automatically validates token compatibility before allowing payment.

**Note**: While x402 v2 theoretically supports multiple payment types, this React implementation currently focuses on ERC-3009 token transfers. Other payment methods could be added in future versions.

## Supported Networks

- Ethereum Mainnet (1) & Sepolia (11155111)
- Base Mainnet (8453) & Sepolia (84532)
- Optimism Mainnet (10) & Sepolia (11155420)
- Arbitrum Mainnet (42161) & Sepolia (421614)
- Polygon Mainnet (137) & Amoy (80002)
- Avalanche C-Chain (43114) & Fuji (43113)

## Complete Example

See the [Next.js example](../../../examples/react-nextjs/) for a full e-commerce implementation with dynamic pricing and order processing.

## License

MIT
