# xtended402 E-Commerce Example

Complete e-commerce example demonstrating xtended402 payment integration with Next.js frontend and Go Gin backend.

## What's This?

A working e-commerce store that demonstrates:
- Context-based dynamic pricing (prices calculated from cart data)
- Server-side validation before payment
- Settlement-before-handler timing (payment confirmed before order processing)
- Request body preservation for handlers

## Prerequisites

- Go 1.21+
- Node.js 18+ and npm
- A wallet with Base Sepolia testnet USDC

## Quick Start

### 1. Start the Backend

```bash
cd go-gin
go run main.go
```

Server starts on `http://localhost:8080`

### 2. Start the Frontend

```bash
cd react-nextjs
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Test the Flow

1. Add products to cart
2. Enter email and click "Proceed to Payment"
3. Connect wallet (Base Sepolia)
4. Component discovers price from backend (402 response)
5. Sign payment authorization
6. Backend verifies, settles, and processes order
7. Order confirmation with transaction hash

## How It Works

### Payment Flow

```
1. Frontend: User builds cart, sends order to backend
   POST /api/purchase { customerEmail, items: [{productId, quantity}] }

2. Backend: Validation middleware
   - Reads request body
   - Validates items, quantities
   - Calculates server-authoritative price from catalog
   - Sets price in context via xtended402.SetContextValueGin()
   - Aborts with 400 if invalid (no payment attempted)

3. Backend: Payment middleware (no signature yet)
   - Returns 402 with PAYMENT-REQUIRED header
   - Header contains payment requirements with amount

4. Frontend: Price discovery
   - Reads PAYMENT-REQUIRED header
   - Displays amount on payment button

5. Frontend: User signs payment
   - Creates ERC-3009 signature
   - Resends request with PAYMENT-SIGNATURE header

6. Backend: Payment middleware (with signature)
   - Verifies signature
   - Settles payment on-chain (settlement timing = "before")
   - Continues to handler

7. Backend: Order handler
   - Payment already confirmed
   - Creates order record with transaction hash
   - Returns success
```

### Architecture

**Frontend** (`react-nextjs/app/page.tsx`):
- Fetches products from `GET /api/products`
- Manages cart state
- Checkout component handles wallet connection and payment
- Automatically discovers price via 402 response

**Backend** (`go-gin/main.go`):
- Product catalog with prices in USD
- Money parser converts USD to USDC smallest units
- Middleware chain: validation → payment → order processing
- Settlement timing: `"before"` (money confirmed before processing)

## Backend API

### `GET /api/products`
Returns product catalog

### `GET /api/orders`
Returns all orders (in-memory storage)

### `POST /api/purchase`
E-commerce checkout with payment verification

**First call (no payment):** 402 with payment requirements
**Second call (with PAYMENT-SIGNATURE):** Verifies, settles, processes order

## Configuration

- **Network**: Base Sepolia (`eip155:84532`)
- **Token**: USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Recipient**: `0xB8E124eaA317761CF8E4C63EB445fA3d21deD759`
- **Facilitator**: `https://x402.org/facilitator`

## What This Demonstrates

**Context-Based Pricing**: Backend calculates prices from request body data (shopping cart) using `xtended402.ContextPrice()` and `xtended402.SetContextValueGin()`. Standard x402 `DynamicPriceFunc` can't access request bodies.

**Settlement-Before-Handler**: Payment is settled BEFORE order processing using `ginmw.WithSettlementTiming("before")`. Ensures money is confirmed before database updates.

**Server-Side Validation**: All pricing and validation happens server-side in middleware that runs before payment is attempted.

**Money Parser**: Prices stored in USD, automatically converted to token smallest units via money parser.

## Learn More

- [xtended402 Documentation](../README.md)
- [Go Package Documentation](../server/go/README.md)
- [React Package Documentation](../client/react/README.md)
- [x402 Protocol](https://github.com/coinbase/x402)
