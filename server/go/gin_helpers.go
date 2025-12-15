package xtended402

import (
	"context"

	"github.com/gin-gonic/gin"
)

// SetContextValueGin sets a value in the request context.
// Updates the Gin request context properly for use with context-based pricing or validation hooks.
func SetContextValueGin(c *gin.Context, key string, value interface{}) {
	ctx := context.WithValue(c.Request.Context(), key, value)
	c.Request = c.Request.WithContext(ctx)
}

// StoreForValidationGin stores data in request context for later validation in before-settle hooks.
func StoreForValidationGin(c *gin.Context, key string, value interface{}) {
	SetContextValueGin(c, key, value)
}
