# xtended402

Focused helpers and a middleware alternative for [x402 v2](https://github.com/coinbase/x402) that solve common real-world patterns.

## What is this?

[x402 v2](https://github.com/coinbase/x402) is a flexible payment protocol for pay-per-call APIs, content paywalls, and more. xtended402 provides a collection of helpers that address specific x402 limitations when building e-commerce and other applications that need to calculate prices from request body data.

**This is a toolbox** Use only what you need: context-based pricing helpers, settlement timing control, or request body preservation. Everything works with standard x402 v2 - no wrappers, just helpers.

**Standard x402 v2 pattern:**
```go
// x402's DynamicPriceFunc only has access to URL and headers
Price: x402http.DynamicPriceFunc(func(ctx, reqCtx) (x402.Price, error) {
    // reqCtx only contains: Path, Method, Headers
    // NO ACCESS to request body (where your shopping cart data lives!)
})
```

**xtended402 provides:**
```go
// Calculate price from POST body in preceding middleware
func validateOrder(c *gin.Context) {
    var order Order
    json.NewDecoder(c.Request.Body).Decode(&order)

    // Server-authoritative pricing from order data
    total := calculateTotal(order)  // From items, quantities, shipping, etc.
    xtended402.SetContextValueGin(c, "x402:price", formatPrice(total))
    c.Next()
}

// Payment middleware reads price from context
routes := x402http.RoutesConfig{
    "POST /checkout": {
        Accepts: []x402http.PaymentOption{{
            Price: xtended402.ContextPrice("x402:price"),  // Uses context value
        }},
    },
}
```

## Key Features

**1. Context-Based Dynamic Pricing**
- Calculate prices from request body data (shopping carts, complex orders)
- Server-authoritative pricing with validation before payment
- Works with any JSON structure

**2. Configurable Settlement Timing**
```go
// Settle BEFORE handler (e-commerce: money confirmed before processing order)
ginmw.WithSettlementTiming("before")

// Or AFTER handler (v2 default: process then settle)
ginmw.WithSettlementTiming("after")
```

**3. Before-Settle Validation Hooks**
- Final validation before settlement (race condition protection)
- Example: Check inventory one last time before taking payment

**4. Full x402 v2 Compatibility**
- All v2 features: multi-chain, Solana, extensions, lifecycle hooks
- Drop-in enhancement, not a wrapper

## What's In The Toolbox

### Server (Go)

Reimplemented Gin middleware with settlement timing control, plus helpers for context-based pricing and request body preservation.

📁 **[server/go/](server/go/)** - See README for installation and usage

**Quick start:**
```go
import (
    xtended402 "github.com/mvpoyatt/xtended402/server/go"
    ginmw "github.com/mvpoyatt/xtended402/server/go/http/gin"
)

r.POST("/checkout",
    validateAndPriceOrder,  // Calculate price from order body
    ginmw.PaymentMiddleware(routes, server,
        ginmw.WithSettlementTiming("before"),  // Settle before processing
    ),
    fulfillOrder,  // Order processing with confirmed payment
)
```

### Client (React)

React component for payment flow integration. One example of a client that uses the enhanced server.

📁 **[client/react/](client/react/)** - See README for installation and usage

**Example:**
```tsx
import { Checkout } from '@xtended402/react';

<Checkout
  paymentEndpoint="https://api.example.com/checkout"
  orderData={cart}  // Component discovers price from server
  displayMode="system"
  accentColor="#338aea"
/>
```

## Use Cases

### E-Commerce Checkout
- Dynamic pricing from shopping cart data
- Server validates before taking payment
- Order processing after confirmed settlement

### Metered API Access
- Dynamic pricing based on request parameters
- Pay-per-call or subscription models

### AI Agent Payments
- Agents can pay for API access
- Automatic price discovery and payment

### Content Paywalls
- Fixed or dynamic pricing
- Immediate access after payment

## How It Works

```
1. Client sends request with order data
   POST /checkout { items: [...], shipping: {...} }

2. Validation middleware
   - Reads request body
   - Validates order (inventory, rules, etc.)
   - Calculates server-authoritative price
   - Sets price in context
   - If invalid: abort with 400 (no payment attempted)

3. Payment middleware
   - If no X-PAYMENT header: return 402 with price from context
   - If X-PAYMENT provided: verify payment
   - Call before-settle hook (final validation)
   - Settle payment
   - If settlement succeeds: continue to handler
   - If settlement fails: abort with 402

4. Handler processes order
   - Payment already confirmed
   - Safe to update database, send emails, etc.
```

## Architecture

xtended402 is a set of focused additions to x402 v2. Use what you need:

- **Helpers** (`helpers.go`, `gin_helpers.go`): Context-based pricing utilities that work with any x402 v2 setup
- **Middleware** (`http/gin/middleware.go`): Reimplemented Gin middleware with settlement timing control
- **Types** (`types.go`): PaymentData wrapper for convenient access to payment info


## Comparison with x402

| Feature | x402 v2 | xtended402 |
|---------|---------|------------|
| Multi-chain support | ✅ | ✅ |
| URL/header-based pricing | ✅ | ✅ |
| Request body-based pricing | ❌ | ✅ |
| Settlement timing control | ❌ (after only) | ✅ (before/after) |
| Before-settle hooks | ✅ (server level) | ✅ (+ middleware level) |
| Request body preservation | ❌ | ✅ |
| PaymentData convenience wrapper | ❌ | ✅ |

## Documentation

- **[Server (Go) Documentation](server/go/README.md)** - Full API reference and examples
- **[Client (React) Documentation](client/react/README.md)** - Component usage and customization
- **[x402 Protocol](https://github.com/coinbase/x402)** - Underlying payment protocol

## Installation

See package-specific READMEs:
- [Go server installation](server/go/README.md#installation)
- [React client installation](client/react/README.md#installation)

## Examples

Complete examples available in each package:
- [Go server examples](server/go/README.md#examples)
- [React client examples](client/react/README.md#examples)

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT

## Credits

Built on [Coinbase x402 v2](https://github.com/coinbase/x402). Portions of the code are derived from x402 v2, licensed under Apache License 2.0.
