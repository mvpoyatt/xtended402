package xtended402

import (
	"encoding/json"

	x402 "github.com/coinbase/x402/go"
	x402types "github.com/coinbase/x402/go/types"
	"github.com/gin-gonic/gin"
)

// PaymentDataKey is the Gin context key where PaymentData is stored after successful payment
const PaymentDataKey = "xtended402PaymentData"

// PaymentData contains all verified payment information made available to handlers
// after successful payment verification and settlement.
type PaymentData struct {
	// PaymentPayload contains the payment details from the client
	PaymentPayload *x402types.PaymentPayload

	// SettleResponse contains the settlement result including transaction hash
	SettleResponse *x402.SettleResponse

	// PaymentRequirements contains the payment requirements that were satisfied
	PaymentRequirements *x402types.PaymentRequirements

	// VerifyResponse contains the verification result from the facilitator
	VerifyResponse *x402.VerifyResponse

	// RequestBody contains the raw request body JSON for access in handlers
	RequestBody json.RawMessage
}

// UnmarshalOrderData unmarshals the request body into the provided struct.
func (p *PaymentData) UnmarshalOrderData(v interface{}) error {
	if len(p.RequestBody) == 0 {
		return nil
	}
	return json.Unmarshal(p.RequestBody, v)
}

// GetPaymentData retrieves verified payment data from the Gin context.
// Returns nil if no payment data is stored.
func GetPaymentData(c *gin.Context) *PaymentData {
	data, exists := c.Get(PaymentDataKey)
	if !exists {
		return nil
	}
	return data.(*PaymentData)
}
