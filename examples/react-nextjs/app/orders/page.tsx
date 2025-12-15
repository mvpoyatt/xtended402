'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type OrderItem = {
  productId: string;
  quantity: number;
};

type Order = {
  id: string;
  customerEmail: string;
  items: OrderItem[];
  total: number;
  transaction: string;
  payer: string;
  createdAt: string;
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8080/api/orders')
      .then(res => res.json())
      .then((data: Order[]) => {
        setOrders(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch orders:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-blue-50 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-5xl font-bold text-zinc-900 dark:text-white">
            Orders
          </h1>
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors"
          >
            Back to Store
          </Link>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="text-center text-zinc-500 dark:text-zinc-400 py-12">
            Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center text-zinc-500 dark:text-zinc-400 py-12">
            No orders yet.
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map(order => (
              <div
                key={order.id}
                className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">
                      {order.id}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="mt-2 sm:mt-0 text-right">
                    <div className="text-2xl font-bold text-zinc-900 dark:text-white">
                      ${order.total.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Customer
                    </h3>
                    <p className="text-sm text-zinc-900 dark:text-white">
                      {order.customerEmail}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Items
                    </h3>
                    <div className="space-y-1">
                      {order.items.map((item, idx) => (
                        <p key={idx} className="text-sm text-zinc-900 dark:text-white">
                          {item.quantity}x {item.productId}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Transaction Hash
                      </h3>
                      <p className="text-sm text-zinc-900 dark:text-white font-mono break-all">
                        {order.transaction}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Payer Address
                      </h3>
                      <p className="text-sm text-zinc-900 dark:text-white font-mono break-all">
                        {order.payer}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
