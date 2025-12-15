# xtended402 Go Server

Helpers and reimplemented middleware for [x402 v2](https://github.com/coinbase/x402) that enable flexible payment patterns.

## What is this?

x402 v2's `DynamicPriceFunc` is designed for URL and header-based pricing. For applications that need to calculate prices from request body data (shopping carts, custom configurations), this toolbox provides:

**Helpers** (work with any x402 v2 setup):
- `ContextPrice()` - Read prices from Go's context
- `SetContextValueGin()` - Set context values in Gin
- `GetPaymentData()` - Convenient access to payment info

**Middleware** (reimplemented for Gin):
- Settlement timing control (`"before"` or `"after"` handler)
- Before-settle validation hooks at middleware level
- Request body preservation

**Use what you need** The helpers work standalone with x402 v2. The middleware adds settlement timing control. All x402 v2 features work (multi-chain, Solana, extensions, hooks).

## Installation

```bash
go get github.com/mvpoyatt/xtended402/server/go
```

## Quick Start

### E-Commerce Pattern (Context-Based Pricing)

```go
package main

import (
    "fmt"

    "github.com/gin-gonic/gin"
    x402 "github.com/coinbase/x402/go"
    x402http "github.com/coinbase/x402/go/http"
    evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
    xtended402 "github.com/mvpoyatt/xtended402/server/go"
    ginmw "github.com/mvpoyatt/xtended402/server/go/http/gin"
)

func main() {
    r := gin.Default()

    // 1. Define routes with context-based pricing
    routes := x402http.RoutesConfig{
        "POST /checkout": {
            Accepts: x402http.PaymentOptions{
                {
                    Scheme:  "exact",
                    Network: "eip155:84532",  // Base Sepolia
                    PayTo:   "0xYourRecipientAddress",
                    Price:   xtended402.ContextPrice("x402:price"),  // Read from context
                },
            },
        },
    }

    // 2. Create facilitator and server
    facilitator := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
        URL: "https://x402.org/facilitator",
    })

    server := x402.Newx402ResourceServer(
        x402.WithFacilitatorClient(facilitator),
        x402.WithSchemeServer("eip155:84532", evm.NewExactEvmScheme()),
    )

    // 3. Setup route with middleware chain
    r.POST("/checkout",
        validateAndPriceOrder,  // Sets price in context
        ginmw.PaymentMiddleware(routes, server,
            ginmw.WithSettlementTiming("before"),  // Settle before handler
        ),
        fulfillOrder,  // Process order after payment confirmed
    )

    r.Run(":8080")
}

// Validation middleware - runs BEFORE payment
func validateAndPriceOrder(c *gin.Context) {
    // First validate order and determine total

    // Set price for payment middleware (in smallest token units)
    priceStr := fmt.Sprintf("%d", total)
    xtended402.SetContextValueGin(c, "x402:price", priceStr)

    c.Next()
}

// Handler - runs AFTER payment is settled
func fulfillOrder(c *gin.Context) {
    // Get payment data
    data := xtended402.GetPaymentData(c)

    // Parse order from preserved request body
    var order Order
    if err := data.UnmarshalOrderData(&order); err != nil {
        c.JSON(400, gin.H{"error": "Invalid order"})
        return
    }

    // Process order (payment already confirmed)

    c.JSON(200, gin.H{
        "success":     true,
        "orderId":     orderID,
        "transaction": data.SettleResponse.Transaction,
    })
}
```

## Which Should I Use?

**Just need dynamic pricing from request bodies?**
Use the helpers (`ContextPrice`, `SetContextValueGin`) with standard x402 v2 middleware.

**Need settlement timing control or before-settle hooks?**
Use the xtended402 middleware. Perfect for e-commerce where you need payment confirmed before order processing.

## Using The Helpers

### Context-Based Dynamic Pricing

Calculate prices from request body data using preceding middleware.

**Problem:** x402's `DynamicPriceFunc` can't access request bodies, making it impossible to price shopping carts or complex orders server-side.

**Solution:** Use `SetContextValueGin()` and `ContextPrice()` helpers:

```go
// Step 1: Set price from request body (in your middleware)
func calculatePrice(c *gin.Context) {
    var order Order
    c.BindJSON(&order)

    price := calculateFromOrder(order)
    xtended402.SetContextValueGin(c, "x402:price", price)  // Helper
    c.Next()
}

// Step 2: Use context price in route config
routes := x402http.RoutesConfig{
    "POST /checkout": {
        Accepts: []x402http.PaymentOption{{
            Price: xtended402.ContextPrice("x402:price"),  // Helper - reads from context
        }},
    },
}
```

These helpers work with standard x402 v2 middleware or the reimplemented middleware below.

## Using The Middleware

The reimplemented Gin middleware adds settlement timing control and before-settle hooks.

### Settlement Timing Control

Choose when settlement happens relative to handler execution.

**Before handler (e-commerce pattern):**
```go
ginmw.PaymentMiddleware(routes, server,
    ginmw.WithSettlementTiming("before"),  // Money confirmed BEFORE processing order
)
```

Flow: Verify → Settle → Handler
- ✅ Payment confirmed before order processing
- ✅ Safe to update inventory, send emails
- ✅ No refunds needed if handler fails

**After handler (v2 default):**
```go
ginmw.PaymentMiddleware(routes, server,
    ginmw.WithSettlementTiming("after"),  // Process BEFORE settling
)
```

Flow: Verify → Handler → Settle
- ✅ Can capture handler response
- ⚠️ Handler might fail after verification
- ⚠️ May need refund logic

### Before-Settle Validation Hooks

Run final validation after verification but before settlement.

**Use case:** Prevent race conditions (e.g., inventory sold out between validation and settlement).

```go
ginmw.PaymentMiddleware(routes, server,
    ginmw.WithSettlementTiming("before"),
    ginmw.WithBeforeSettleHook(func(c *gin.Context, verify *x402.VerifyResponse) error {
        order := c.MustGet("order").(Order)

        // Final inventory check with lock
        if !db.CheckAndLockInventory(order.Items) {
            return errors.New("inventory no longer available")
        }

        return nil  // OK to settle
    }),
)
```

### Request Body Preservation

The middleware preserves request body so handlers can access order data after payment.

```go
func handler(c *gin.Context) {
    data := xtended402.GetPaymentData(c)  // Helper

    var order Order
    data.UnmarshalOrderData(&order)  // Parse preserved request body

    // Process with order data + payment confirmation
}
```

### PaymentData Helper

Easy access to all payment-related information in handlers.

```go
data := xtended402.GetPaymentData(c)  // Helper

txHash := data.SettleResponse.Transaction
payer := data.SettleResponse.Payer
network := data.SettleResponse.Network
amount := data.PaymentRequirements.Amount
```

## Comparison with x402 v2

| Feature | x402 v2 | xtended402 |
|---------|---------|----------|
| URL/header-based pricing | ✅ | ✅ |
| Request body-based pricing | ❌ | ✅ |
| Settlement timing | After only | Before or After |
| Before-settle hooks | Server level | Server + Middleware level |
| Request body preservation | ❌ | ✅ |
| PaymentData wrapper | ❌ | ✅ |
| Multi-chain, Solana, extensions | ✅ | ✅ |

## Best Practices

### 1. Always Validate Before Payment

```go
// ✅ CORRECT
r.POST("/checkout",
    validateOrder,      // Abort with 400 if invalid (no payment attempted)
    calculatePrice,
    ginmw.PaymentMiddleware(...),
    fulfillOrder,
)

// ❌ WRONG
r.POST("/checkout",
    ginmw.PaymentMiddleware(...),  // Payment taken
    func(c *gin.Context) {
        if !isValid() {  // Too late! Already charged customer
            return
        }
    },
)
```

### 2. Use Server-Authoritative Pricing

```go
// ✅ CORRECT - Server calculates price
func calculatePrice(c *gin.Context) {
    order := parseOrder(c)
    price := db.GetPrices(order.Items)  // Server's authoritative prices
    xtended402.SetContextValueGin(c, "x402:price", price)
}

// ❌ WRONG - Trusting client's price
func calculatePrice(c *gin.Context) {
    order := parseOrder(c)
    price := order.Total  // Client could manipulate this!
    xtended402.SetContextValueGin(c, "x402:price", price)
}
```

### 3. Use Settlement Timing Appropriately

- **E-commerce, order processing**: Use `"before"` - money confirmed before fulfillment
- **Content delivery, API responses**: Use `"after"` - deliver content, then settle

### 4. Handle Edge Cases

```go
func fulfillOrder(c *gin.Context) {
    data := xtended402.GetPaymentData(c)

    // Check idempotency (prevent duplicate orders)
    if db.TransactionExists(data.SettleResponse.Transaction) {
        c.JSON(200, gin.H{"success": true, "note": "already processed"})
        return
    }

    // Process order...
}
```

## API Reference

### Helpers (work with any x402 v2 setup)

#### `xtended402.ContextPrice(key string) x402http.DynamicPriceFunc`
Creates a `DynamicPriceFunc` that reads price from Go's `context.Context`. Use with `SetContextValueGin`.

```go
Price: xtended402.ContextPrice("x402:price")
```

#### `xtended402.SetContextValueGin(c *gin.Context, key string, value interface{})`
Sets a value in Gin's request context for use with `ContextPrice`.

```go
xtended402.SetContextValueGin(c, "x402:price", "1000000")
```

#### `xtended402.GetPaymentData(c *gin.Context) *PaymentData`
Retrieves payment data from Gin context after successful payment. Only available when using xtended402 middleware with `WithSettlementTiming("before")`.

```go
data := xtended402.GetPaymentData(c)
txHash := data.SettleResponse.Transaction
```

#### `xtended402.CreateBeforeSettleHook(fn func(context.Context) error)`
Wraps a validation function for use with x402's `OnBeforeSettle` hook at server level.

```go
server.OnBeforeSettle(xtended402.CreateBeforeSettleHook(func(ctx context.Context) error {
    order := ctx.Value("order").(Order)
    return validateInventory(order)
}))
```

### Middleware Options (xtended402 middleware)

#### `ginmw.WithSettlementTiming(timing string)`
Sets when settlement occurs: `"before"` or `"after"` handler.

```go
ginmw.WithSettlementTiming("before")  // E-commerce: settle before processing
ginmw.WithSettlementTiming("after")   // v2 default: settle after processing
```

#### `ginmw.WithBeforeSettleHook(hook func(*gin.Context, *x402.VerifyResponse) error)`
Runs after verification but before settlement for final validation.

```go
ginmw.WithBeforeSettleHook(func(c *gin.Context, verify *x402.VerifyResponse) error {
    // Final validation logic
    return nil  // or error to abort
})
```

#### All v2 Options

All x402 v2 middleware options work:

```go
ginmw.WithFacilitatorClient(client)
ginmw.WithScheme(network, schemeServer)
ginmw.WithTimeout(30 * time.Second)
ginmw.WithErrorHandler(handler)
ginmw.WithSettlementHandler(handler)
ginmw.WithPaywallConfig(config)
ginmw.WithSyncFacilitatorOnStart(true)
```

## Examples

See the [examples directory](../../examples/) for a complete working e-commerce application.

## License

MIT

## Credits

Built on [Coinbase x402 v2](https://github.com/coinbase/x402). Portions derived from x402, licensed under Apache License 2.0.
