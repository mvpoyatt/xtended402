'use client';

import { Checkout } from '@xtended402/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
};

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [email, setEmail] = useState('customer@example.com');

  // Fetch products from backend
  useEffect(() => {
    fetch('http://localhost:8080/api/products')
      .then(res => res.json())
      .then((data: Product[]) => {
        setProducts(data);
        // Initialize quantities to 0
        const initialQuantities: Record<string, number> = {};
        data.forEach(product => {
          initialQuantities[product.id] = 0;
        });
        setQuantities(initialQuantities);
      })
      .catch(err => console.error('Failed to fetch products:', err));
  }, []);

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(0, (prev[productId] || 0) + delta)
    }));
  };

  const totalItems = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const totalPrice = products.reduce((sum, product) => {
    return sum + (product.price * (quantities[product.id] || 0));
  }, 0);

  const cartItems = products
    .filter(product => quantities[product.id] > 0)
    .map(product => ({
      productId: product.id,
      quantity: quantities[product.id]
    }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-blue-50 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-5xl font-bold text-zinc-900 dark:text-white">
            Debugging Ducks
          </h1>
          <Link
            href="/orders"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors"
          >
            View Orders
          </Link>
        </div>

        {/* Two Column Layout */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Products List - Left Side */}
          <div className="flex-1">
            {products.length === 0 ? (
              <div className="text-center text-zinc-500 dark:text-zinc-400 py-12">
                Loading products...
              </div>
            ) : (
              <div className="space-y-6">
                {products.map(product => (
                  <div
                    key={product.id}
                    className="bg-white dark:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row"
                  >
                    <div className="w-full sm:w-48 h-48 bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900 dark:to-yellow-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                      <img
                        src={`/${product.id}.webp`}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                          {product.name}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4">
                          {product.description}
                        </p>
                        <div className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
                          ${product.price.toFixed(2)}
                        </div>
                      </div>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          disabled={quantities[product.id] === 0}
                          className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white font-bold text-xl hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                        >
                          −
                        </button>
                        <span className="text-xl font-semibold text-zinc-900 dark:text-white min-w-[2rem] text-center">
                          {quantities[product.id] || 0}
                        </span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-xl hover:bg-blue-700 cursor-pointer transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Summary & Checkout - Right Side */}
          <div className="w-full lg:w-[400px] lg:sticky lg:top-8 h-fit flex-shrink-0">
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 pb-4">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">
                Your Cart
              </h2>

              {totalItems === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400 text-center py-8">
                  Add some debugging ducks to your cart to get started
                </p>
              ) : (
                <>
                  {/* Cart items */}
                  <div className="space-y-3 mb-6">
                    {products.filter(p => quantities[p.id] > 0).map(product => (
                      <div key={product.id} className="flex justify-between items-center text-zinc-700 dark:text-zinc-300">
                        <span>
                          {quantities[product.id]}x {product.name}
                        </span>
                        <span className="font-semibold">
                          ${(product.price * quantities[product.id]).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mb-6">
                    <div className="flex justify-between items-center text-xl font-bold text-zinc-900 dark:text-white">
                      <span>Total</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Email input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Checkout button */}
                  <Checkout
                    paymentEndpoint={'http://localhost:8080/api/purchase'}
                    orderData={{
                      customerEmail: email,
                      items: cartItems
                    }}
                    buttonWidth={350}
                    displayMode="system"
                    accentColor="#2563eb"
                  />
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
