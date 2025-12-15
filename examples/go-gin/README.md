# Go + Gin Backend

Part of the xtended402 e-commerce example.

## Setup

See [/examples/README.md](../README.md) for complete setup instructions and how this backend works with the React frontend.

## Quick Start

```bash
go run main.go
```

Server starts on `http://localhost:8080`

## Endpoints

- `GET /health` - Health check
- `GET /api/products` - Product catalog
- `GET /api/orders` - All orders
- `POST /api/purchase` - Checkout with payment verification
