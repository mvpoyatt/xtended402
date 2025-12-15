// Package gin provides enhanced x402 middleware for Gin with:
// - Configurable settlement timing (before or after handler)
// - Before-settle validation hooks
// - Request body preservation
// - PaymentData convenience wrapper
package gin

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/bazaar"
	x402http "github.com/coinbase/x402/go/http"
	"github.com/gin-gonic/gin"
	xtended402 "github.com/mvpoyatt/xtended402/server/go"
)

// ============================================================================
// Gin Adapter Implementation
// ============================================================================

// GinAdapter implements HTTPAdapter for Gin framework
type GinAdapter struct {
	ctx *gin.Context
}

// NewGinAdapter creates a new Gin adapter
func NewGinAdapter(ctx *gin.Context) *GinAdapter {
	return &GinAdapter{ctx: ctx}
}

// GetHeader gets a request header
func (a *GinAdapter) GetHeader(name string) string {
	return a.ctx.GetHeader(name)
}

// GetMethod gets the HTTP method
func (a *GinAdapter) GetMethod() string {
	return a.ctx.Request.Method
}

// GetPath gets the request path
func (a *GinAdapter) GetPath() string {
	return a.ctx.Request.URL.Path
}

// GetURL gets the full request URL
func (a *GinAdapter) GetURL() string {
	scheme := "http"
	if a.ctx.Request.TLS != nil {
		scheme = "https"
	}
	host := a.ctx.Request.Host
	if host == "" {
		host = a.ctx.GetHeader("Host")
	}
	return fmt.Sprintf("%s://%s%s", scheme, host, a.ctx.Request.URL.Path)
}

// GetAcceptHeader gets the Accept header
func (a *GinAdapter) GetAcceptHeader() string {
	return a.ctx.GetHeader("Accept")
}

// GetUserAgent gets the User-Agent header
func (a *GinAdapter) GetUserAgent() string {
	return a.ctx.GetHeader("User-Agent")
}

// ============================================================================
// Middleware Configuration
// ============================================================================

// MiddlewareConfig configures the payment middleware
type MiddlewareConfig struct {
	// Routes configuration
	Routes x402http.RoutesConfig

	// Facilitator client(s)
	FacilitatorClients []x402.FacilitatorClient

	// Scheme registrations
	Schemes []SchemeRegistration

	// Paywall configuration
	PaywallConfig *x402http.PaywallConfig

	// Sync with facilitator on start
	SyncFacilitatorOnStart bool

	// Custom error handler
	ErrorHandler func(*gin.Context, error)

	// Custom settlement handler
	SettlementHandler func(*gin.Context, *x402.SettleResponse)

	// Context timeout for payment operations
	Timeout time.Duration

	// SettlementTiming controls when settlement occurs relative to handler execution
	// "after" (default): verify, run handler, then settle
	// "before": settle before handler (safer for e-commerce - money confirmed before order processing)
	SettlementTiming string

	// BeforeSettleHook is called after verification but before settlement
	BeforeSettleHook func(*gin.Context, *x402.VerifyResponse) error
}

// SchemeRegistration registers a scheme with the server
type SchemeRegistration struct {
	Network x402.Network
	Server  x402.SchemeNetworkServer
}

// ============================================================================
// Middleware Options
// ============================================================================

// MiddlewareOption configures the middleware
type MiddlewareOption func(*MiddlewareConfig)

// WithFacilitatorClient adds a facilitator client
func WithFacilitatorClient(client x402.FacilitatorClient) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.FacilitatorClients = append(c.FacilitatorClients, client)
	}
}

// WithScheme registers a scheme server
func WithScheme(network x402.Network, schemeServer x402.SchemeNetworkServer) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.Schemes = append(c.Schemes, SchemeRegistration{
			Network: network,
			Server:  schemeServer,
		})
	}
}

// WithPaywallConfig sets the paywall configuration
func WithPaywallConfig(config *x402http.PaywallConfig) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.PaywallConfig = config
	}
}

// WithSyncFacilitatorOnStart sets whether to sync with facilitator on startup
func WithSyncFacilitatorOnStart(sync bool) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.SyncFacilitatorOnStart = sync
	}
}

// WithErrorHandler sets a custom error handler
func WithErrorHandler(handler func(*gin.Context, error)) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.ErrorHandler = handler
	}
}

// WithSettlementHandler sets a custom settlement handler
func WithSettlementHandler(handler func(*gin.Context, *x402.SettleResponse)) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.SettlementHandler = handler
	}
}

// WithTimeout sets the context timeout for payment operations
func WithTimeout(timeout time.Duration) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.Timeout = timeout
	}
}

// WithSettlementTiming sets when settlement occurs relative to handler execution.
// Options: "after" (default, handler then settle) or "before" (settle then handler).
func WithSettlementTiming(timing string) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.SettlementTiming = timing
	}
}

// WithBeforeSettleHook sets a hook that runs after verification but before settlement.
// Useful for final validation to prevent race conditions.
func WithBeforeSettleHook(hook func(*gin.Context, *x402.VerifyResponse) error) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.BeforeSettleHook = hook
	}
}

// ============================================================================
// Payment Middleware
// ============================================================================

// PaymentMiddleware creates Gin middleware for x402 payment handling using a pre-configured server.
// Supports configurable settlement timing, before-settle hooks, and context-based dynamic pricing.
func PaymentMiddleware(routes x402http.RoutesConfig, server *x402.X402ResourceServer, opts ...MiddlewareOption) gin.HandlerFunc {
	config := &MiddlewareConfig{
		Routes:                 routes,
		SyncFacilitatorOnStart: true,
		Timeout:                30 * time.Second,
		SettlementTiming:       "after",
	}

	// Apply options
	for _, opt := range opts {
		opt(config)
	}

	// Wrap the resource server with HTTP functionality
	httpServer := x402http.Wrappedx402HTTPResourceServer(routes, server)

	httpServer.RegisterExtension(bazaar.BazaarResourceServerExtension)

	// Initialize if requested
	if config.SyncFacilitatorOnStart {
		ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
		defer cancel()
		if err := httpServer.Initialize(ctx); err != nil {
			fmt.Printf("Warning: failed to initialize x402 server: %v\n", err)
		}
	}

	return createMiddlewareHandler(httpServer, config)
}

// PaymentMiddlewareFromConfig creates Gin middleware for x402 payment handling.
// This creates the server internally from the provided options.
func PaymentMiddlewareFromConfig(routes x402http.RoutesConfig, opts ...MiddlewareOption) gin.HandlerFunc {
	config := &MiddlewareConfig{
		Routes:                 routes,
		FacilitatorClients:     []x402.FacilitatorClient{},
		Schemes:                []SchemeRegistration{},
		SyncFacilitatorOnStart: true,
		Timeout:                30 * time.Second,
		SettlementTiming:       "after",
	}

	// Apply options
	for _, opt := range opts {
		opt(config)
	}

	serverOpts := []x402.ResourceServerOption{}
	for _, client := range config.FacilitatorClients {
		serverOpts = append(serverOpts, x402.WithFacilitatorClient(client))
	}

	httpServer := x402http.Newx402HTTPResourceServer(config.Routes, serverOpts...)

	httpServer.RegisterExtension(bazaar.BazaarResourceServerExtension)

	// Register schemes
	for _, scheme := range config.Schemes {
		httpServer.Register(scheme.Network, scheme.Server)
	}

	// Initialize if requested
	if config.SyncFacilitatorOnStart {
		ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
		defer cancel()
		if err := httpServer.Initialize(ctx); err != nil {
			fmt.Printf("Warning: failed to initialize x402 server: %v\n", err)
		}
	}

	return createMiddlewareHandler(httpServer, config)
}

// createMiddlewareHandler creates the actual Gin handler function with enhancements
func createMiddlewareHandler(server *x402http.HTTPServer, config *MiddlewareConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ========================================
		// ENHANCEMENT: Preserve request body
		// ========================================
		var requestBody []byte
		if c.Request.Body != nil {
			bodyBytes, err := io.ReadAll(c.Request.Body)
			if err == nil {
				requestBody = bodyBytes
				// Restore body for further reading
				c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
			}
		}

		// Create adapter and request context
		adapter := NewGinAdapter(c)
		reqCtx := x402http.HTTPRequestContext{
			Adapter: adapter,
			Path:    c.Request.URL.Path,
			Method:  c.Request.Method,
		}

		// Check if route requires payment
		if !server.RequiresPayment(reqCtx) {
			c.Next()
			return
		}

		// Create context with timeout
		ctx, cancel := context.WithTimeout(c.Request.Context(), config.Timeout)
		defer cancel()

		result := server.ProcessHTTPRequest(ctx, reqCtx, config.PaywallConfig)

		// Handle result based on type
		switch result.Type {
		case x402http.ResultNoPaymentRequired:
			c.Next()

		case x402http.ResultPaymentError:
			handlePaymentError(c, result.Response, config)

		case x402http.ResultPaymentVerified:
			// ========================================
			// ENHANCEMENT: Settlement timing logic
			// ========================================
			if config.SettlementTiming == "before" {
				// Settle BEFORE handler (e-commerce pattern)
				handlePaymentVerifiedSettleBefore(c, server, ctx, result, config, requestBody)
			} else {
				// Settle AFTER handler
				handlePaymentVerifiedSettleAfter(c, server, ctx, result, config, requestBody)
			}
		}
	}
}

// handlePaymentError handles payment error responses
func handlePaymentError(c *gin.Context, response *x402http.HTTPResponseInstructions, _ *MiddlewareConfig) {
	c.Status(response.Status)

	for key, value := range response.Headers {
		c.Header(key, value)
	}

	if response.IsHTML {
		c.Data(response.Status, "text/html; charset=utf-8", []byte(response.Body.(string)))
	} else {
		c.JSON(response.Status, response.Body)
	}

	c.Abort()
}

// handlePaymentVerifiedSettleAfter handles verified payments with after-settlement timing:
// verify → run handler → settle
func handlePaymentVerifiedSettleAfter(
	c *gin.Context,
	server *x402http.HTTPServer,
	ctx context.Context,
	result x402http.HTTPProcessResult,
	config *MiddlewareConfig,
	requestBody []byte,
) {
	// Capture response for settlement
	writer := &responseCapture{
		ResponseWriter: c.Writer,
		body:           &bytes.Buffer{},
		statusCode:     http.StatusOK,
	}
	c.Writer = writer

	// Continue to protected handler
	c.Next()

	// Check if aborted
	if c.IsAborted() {
		return
	}

	// Restore original writer
	c.Writer = writer.ResponseWriter

	// Don't settle if response failed
	if writer.statusCode >= 400 {
		c.Writer.WriteHeader(writer.statusCode)
		_, _ = c.Writer.Write(writer.body.Bytes())
		return
	}

	// Call before-settle hook if configured
	if config.BeforeSettleHook != nil {
		verifyResp := &x402.VerifyResponse{IsValid: true} // Simplified
		if err := config.BeforeSettleHook(c, verifyResp); err != nil {
			if config.ErrorHandler != nil {
				config.ErrorHandler(c, fmt.Errorf("before-settle hook failed: %w", err))
			} else {
				c.JSON(http.StatusPaymentRequired, gin.H{
					"error":   "Pre-settlement validation failed",
					"details": err.Error(),
				})
			}
			return
		}
	}

	// Process settlement
	settleResult := server.ProcessSettlement(ctx, *result.PaymentPayload, *result.PaymentRequirements)

	// Check settlement success
	if !settleResult.Success {
		errorReason := settleResult.ErrorReason
		if errorReason == "" {
			errorReason = "Settlement failed"
		}
		if config.ErrorHandler != nil {
			config.ErrorHandler(c, fmt.Errorf("settlement failed: %s", errorReason))
		} else {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"error":   "Settlement failed",
				"details": errorReason,
			})
		}
		return
	}

	// Add settlement headers
	for key, value := range settleResult.Headers {
		c.Header(key, value)
	}

	// Call settlement handler if configured
	if config.SettlementHandler != nil {
		settleResponse := &x402.SettleResponse{
			Success:     true,
			Transaction: settleResult.Transaction,
			Network:     settleResult.Network,
			Payer:       settleResult.Payer,
		}
		config.SettlementHandler(c, settleResponse)
	}

	// Write captured response
	c.Writer.WriteHeader(writer.statusCode)
	_, _ = c.Writer.Write(writer.body.Bytes())
}

// handlePaymentVerifiedSettleBefore handles verified payments with e-commerce timing:
// verify → settle → run handler
func handlePaymentVerifiedSettleBefore(
	c *gin.Context,
	server *x402http.HTTPServer,
	ctx context.Context,
	result x402http.HTTPProcessResult,
	config *MiddlewareConfig,
	requestBody []byte,
) {
	// Call before-settle hook if configured
	if config.BeforeSettleHook != nil {
		verifyResp := &x402.VerifyResponse{IsValid: true} // Simplified
		if err := config.BeforeSettleHook(c, verifyResp); err != nil {
			if config.ErrorHandler != nil {
				config.ErrorHandler(c, fmt.Errorf("before-settle hook failed: %w", err))
			} else {
				c.JSON(http.StatusPaymentRequired, gin.H{
					"error":   "Pre-settlement validation failed",
					"details": err.Error(),
				})
			}
			c.Abort()
			return
		}
	}

	// Process settlement BEFORE handler
	settleResult := server.ProcessSettlement(ctx, *result.PaymentPayload, *result.PaymentRequirements)

	// Check settlement success
	if !settleResult.Success {
		errorReason := settleResult.ErrorReason
		if errorReason == "" {
			errorReason = "Settlement failed"
		}
		if config.ErrorHandler != nil {
			config.ErrorHandler(c, fmt.Errorf("settlement failed: %s", errorReason))
		} else {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"error":   "Settlement failed",
				"details": errorReason,
			})
		}
		c.Abort()
		return
	}

	// Add settlement headers
	for key, value := range settleResult.Headers {
		c.Header(key, value)
	}

	// ========================================
	// ENHANCEMENT: Store PaymentData for handler
	// ========================================
	paymentData := &xtended402.PaymentData{
		PaymentPayload:      result.PaymentPayload,
		SettleResponse:      &x402.SettleResponse{
			Success:     true,
			Transaction: settleResult.Transaction,
			Network:     settleResult.Network,
			Payer:       settleResult.Payer,
		},
		PaymentRequirements: result.PaymentRequirements,
		VerifyResponse:      &x402.VerifyResponse{IsValid: true},
		RequestBody:         requestBody,
	}
	c.Set(xtended402.PaymentDataKey, paymentData)

	// Call settlement handler if configured
	if config.SettlementHandler != nil {
		config.SettlementHandler(c, paymentData.SettleResponse)
	}

	// Continue to handler (payment already settled)
	c.Next()
}

// ============================================================================
// Response Capture
// ============================================================================

// responseCapture captures the response for settlement processing
type responseCapture struct {
	gin.ResponseWriter
	body       *bytes.Buffer
	statusCode int
	written    bool
	mu         sync.Mutex
}

func (w *responseCapture) WriteHeader(code int) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.writeHeaderLocked(code)
}

func (w *responseCapture) writeHeaderLocked(code int) {
	if !w.written {
		w.statusCode = code
		w.written = true
	}
}

func (w *responseCapture) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if !w.written {
		w.writeHeaderLocked(http.StatusOK)
	}
	return w.body.Write(data)
}

func (w *responseCapture) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}
