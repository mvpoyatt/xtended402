package xtended402

import (
	"context"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
)

// ContextPrice creates a DynamicPriceFunc that reads price from request context.
// Use with SetContextValueGin to calculate prices from request body data in preceding middleware.
func ContextPrice(key string) x402http.DynamicPriceFunc {
	return func(ctx context.Context, reqCtx x402http.HTTPRequestContext) (x402.Price, error) {
		if price, ok := ctx.Value(key).(string); ok {
			return x402.Price(price), nil
		}
		return nil, fmt.Errorf("price not found in context with key: %s", key)
	}
}

// CreateBeforeSettleHook creates a before-settle hook from a validation function.
// Useful for final validation before settlement to avoid race conditions.
func CreateBeforeSettleHook(validateFn func(ctx context.Context) error) x402.BeforeSettleHook {
	return func(settleCtx x402.SettleContext) (*x402.BeforeHookResult, error) {
		if err := validateFn(settleCtx.Ctx); err != nil {
			return &x402.BeforeHookResult{
				Abort:  true,
				Reason: err.Error(),
			}, nil
		}
		return nil, nil
	}
}

// StoreForValidation stores data in request context for later validation in before-settle hooks.
// For Gin, use StoreForValidationGin instead.
func StoreForValidation(ctx context.Context, key string, value interface{}) context.Context {
	return context.WithValue(ctx, key, value)
}
