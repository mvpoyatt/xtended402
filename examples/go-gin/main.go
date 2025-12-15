package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sync"
	"time"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	evmserver "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	"github.com/gin-gonic/gin"

	xtended402 "github.com/mvpoyatt/xtended402/server/go"
	ginmw "github.com/mvpoyatt/xtended402/server/go/http/gin"
)

// Product represents a product in the store
type Product struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
}

// OrderItem represents an item in an order
type OrderItem struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
}

// Order represents a placed order
type Order struct {
	ID            string      `json:"id"`
	CustomerEmail string      `json:"customerEmail"`
	Items         []OrderItem `json:"items"`
	Total         float64     `json:"total"`
	Transaction   string      `json:"transaction"`
	Payer         string      `json:"payer"`
	CreatedAt     time.Time   `json:"createdAt"`
}

// PurchaseRequest is what the frontend sends
type PurchaseRequest struct {
	CustomerEmail string      `json:"customerEmail"`
	Items         []OrderItem `json:"items"`
}

// In-memory storage
var (
	products = map[string]Product{
		"cowboy-duck": {
			ID:          "cowboy-duck",
			Name:        "Cowboy Duck",
			Description: "A rootin-tootin duck to wrangle your wildest bugs with frontier grit. Perfect for taming unruly code.",
			Price:       1.50,
		},
		"artiste-duck": {
			ID:          "artiste-duck",
			Name:        "Artiste Duck",
			Description: "Brings creative solutions to your debugging sessions. A true master of code aesthetics.",
			Price:       1.50,
		},
		"batman-duck": {
			ID:          "batman-duck",
			Name:        "Batman Duck",
			Description: "The hero your codebase deserves. Strikes fear into the hearts of bugs everywhere.",
			Price:       2.50,
		},
	}

	orders   = make(map[string]Order)
	ordersMu sync.RWMutex
	orderID  int
)

const (
	network          = x402.Network("eip155:84532")                 // Base Sepolia (CAIP-2 format)
	usdcAddress      = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" // USDC on Base Sepolia
	recipientAddress = "0xB8E124eaA317761CF8E4C63EB445fA3d21deD759" // Your address
	facilitatorURL   = "https://x402.org/facilitator"
)

func main() {
	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, PAYMENT-SIGNATURE")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy"})
	})

	// Get all products
	r.GET("/api/products", getProducts)

	// Get all orders
	r.GET("/api/orders", getOrders)

	// Configure payment route with dynamic pricing
	routes := x402http.RoutesConfig{
		"POST /api/purchase": {
			Accepts: []x402http.PaymentOption{{
				Scheme:  "exact",
				Network: network,
				PayTo:   recipientAddress,
				Price:   xtended402.ContextPrice("x402:price"), // Dynamic pricing from context
			}},
		},
	}

	// Create facilitator client
	facilitator := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})

	// Create x402 server
	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(facilitator),
	)

	// Register EVM exact scheme for Base Sepolia
	evmScheme := evmserver.NewExactEvmScheme()

	// Register money parser to convert USD to USDC
	evmScheme.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		// Convert USD amount to USDC smallest units (6 decimals)
		usdcAmount := fmt.Sprintf("%.0f", amount*1e6)
		return &x402.AssetAmount{
			Amount: usdcAmount,
			Asset:  usdcAddress,
			Extra: map[string]interface{}{
				"token": "USDC",
			},
		}, nil
	})

	server.Register(network, evmScheme)

	// Setup purchase endpoint with payment
	r.POST("/api/purchase",
		calculateOrderTotal, // Calculate price from order
		ginmw.PaymentMiddleware(routes, server,
			ginmw.WithSettlementTiming("before"), // Settle before processing order
		),
		processOrder, // Process order after payment confirmed
	)

	log.Println("Server starting on :8080")
	log.Println("Products endpoint: http://localhost:8080/api/products")
	log.Println("Orders endpoint: http://localhost:8080/api/orders")
	r.Run(":8080")
}

// getProducts returns all available products
func getProducts(c *gin.Context) {
	productList := make([]Product, 0, len(products))
	for _, product := range products {
		productList = append(productList, product)
	}
	c.JSON(200, productList)
}

// getOrders returns all orders
func getOrders(c *gin.Context) {
	ordersMu.RLock()
	defer ordersMu.RUnlock()

	orderList := make([]Order, 0, len(orders))
	for _, order := range orders {
		orderList = append(orderList, order)
	}
	c.JSON(200, orderList)
}

// calculateOrderTotal calculates dynamic price from order data
func calculateOrderTotal(c *gin.Context) {
	var req PurchaseRequest

	// Read and restore request body
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(400, gin.H{"error": "Failed to read request body"})
		c.Abort()
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid order data"})
		c.Abort()
		return
	}

	// Calculate total from items in USD
	var total float64
	for _, item := range req.Items {
		product, exists := products[item.ProductID]
		if !exists {
			c.JSON(400, gin.H{"error": fmt.Sprintf("Unknown product: %s", item.ProductID)})
			c.Abort()
			return
		}
		if item.Quantity <= 0 {
			c.JSON(400, gin.H{"error": "Quantity must be greater than 0"})
			c.Abort()
			return
		}
		total += product.Price * float64(item.Quantity)
	}

	if total == 0 {
		c.JSON(400, gin.H{"error": "Cart is empty"})
		c.Abort()
		return
	}

	// Set price in context for payment middleware
	xtended402.SetContextValueGin(c, "x402:price", fmt.Sprintf("%.2f", total))
	c.Next()
}

// processOrder processes the order after payment is confirmed
func processOrder(c *gin.Context) {
	// Get verified payment data
	data := xtended402.GetPaymentData(c)
	if data == nil {
		c.JSON(500, gin.H{"error": "Payment data not available"})
		return
	}

	var req PurchaseRequest
	if err := data.UnmarshalOrderData(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid order data"})
		return
	}

	// Recalculate total for order record
	var total float64
	for _, item := range req.Items {
		product := products[item.ProductID]
		total += product.Price * float64(item.Quantity)
	}

	// Create order record
	ordersMu.Lock()
	orderID++
	orderIDStr := fmt.Sprintf("ORD-%d", orderID)
	order := Order{
		ID:            orderIDStr,
		CustomerEmail: req.CustomerEmail,
		Items:         req.Items,
		Total:         total,
		Transaction:   data.SettleResponse.Transaction,
		Payer:         data.SettleResponse.Payer,
		CreatedAt:     time.Now(),
	}
	orders[orderIDStr] = order
	ordersMu.Unlock()

	log.Printf("Order created: %s, email: %s, total: $%.2f, tx: %s",
		orderIDStr, req.CustomerEmail, total, data.SettleResponse.Transaction)

	c.JSON(200, gin.H{
		"success":     true,
		"message":     "Order processed successfully",
		"orderId":     orderIDStr,
		"transaction": data.SettleResponse.Transaction,
		"payer":       data.SettleResponse.Payer,
		"total":       total,
	})
}
