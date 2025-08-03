"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import axios from "axios"
import { format } from "date-fns"
import { LoaderCircle, RefreshCw } from "lucide-react"

/* ──────────────────────────   Types & Interfaces   ────────────────────────── */
interface NftTransaction {
  block_date: string
  blockchain: number
  chain_id: number
  collection: string
  contract_address: string
  contract_created_date: string
  contract_type: string
  hash: string
  is_washtrade: string
  marketplace: string
  receiving_address: string
  sale_price_usd: number
  sending_address: string
  timestamp: string
  token_id: string
  transaction_type: string
}

interface NftTransactionProps {
  blockchain: string
  contractAddress: string
  tokenId: string
  timeRange: string
  apiKey: string
  setTimeRange: (timeRange: string) => void // accepted but not used here
}

/* ──────────────────────────   Local cache helpers   ────────────────────────── */
interface CacheData {
  data: any
  timestamp: number
  expiresIn: number
}

const CACHE_DURATION = {
  TRANSACTIONS: 5 * 60 * 1000, // 5 min
}

/* ──────────────────────────   Component   ────────────────────────── */
const NftTransaction: React.FC<NftTransactionProps> = ({ blockchain, contractAddress, tokenId, timeRange, apiKey }) => {
  /* STATE */
  const [transactions, setTransactions] = useState<NftTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* refs for cache & debounce */
  const cacheRef = useRef<Record<string, CacheData>>({})
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  /* ── cache helpers ── */
  const keyOf = (p: object) => `transactions_${JSON.stringify(p)}`
  const getCached = (k: string) =>
    cacheRef.current[k] && Date.now() < cacheRef.current[k].timestamp + cacheRef.current[k].expiresIn
      ? cacheRef.current[k].data
      : null
  const setCached = (k: string, d: any) =>
    (cacheRef.current[k] = {
      data: d,
      timestamp: Date.now(),
      expiresIn: CACHE_DURATION.TRANSACTIONS,
    })
  const purge = (k: string) => delete cacheRef.current[k]

  /* ── fetcher ── */
  const fetchTransactions = useCallback(async () => {
    if (!apiKey) return

    /* NOTE: token_id must be an array & sort_by is required by API */
    const params = {
      blockchain,
      contract_address: contractAddress,
      token_id: [tokenId],
      time_range: timeRange,
      sort_by: "timestamp",
      sort_order: "desc",
    }

    const cacheKey = keyOf(params)
    const cached = getCached(cacheKey)
    if (cached) {
      setTransactions(cached)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/transactions", {
        params,
        headers: { "x-api-key": apiKey },
      })
      const data: NftTransaction[] = Array.isArray(res.data.data) ? res.data.data : [res.data.data]
      setTransactions(data.filter((tx): tx is NftTransaction => tx !== null))
      setCached(cacheKey, data)
    } catch (e) {
      console.error("Error fetching transactions:", e)
      setError("Failed to fetch transaction data")
    } finally {
      setIsLoading(false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange])

  /* ── retry ── */
  const retry = () => {
    purge(
      keyOf({
        blockchain,
        contract_address: contractAddress,
        token_id: [tokenId],
        time_range: timeRange,
        sort_by: "timestamp",
        sort_order: "desc",
      }),
    )
    fetchTransactions()
  }

  /* ── debounced trigger ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (blockchain && contractAddress && tokenId && timeRange) fetchTransactions()
    }, 300)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [fetchTransactions])

  /* ── UI helpers ── */
  const Banner = ({ msg }: { msg: string }) => (
    <div className="flex items-center space-x-1 sm:space-x-2 p-2 sm:p-4 bg-blue-100 border-2 sm:border-4 border-black">
      <LoaderCircle className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600 flex-shrink-0" />
      <span className="font-bold text-xs sm:text-sm">{msg}</span>
    </div>
  )

  const RetryBtn = () => (
    <button
      onClick={retry}
      className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 font-bold text-xs sm:text-sm bg-red-200 hover:bg-red-300 disabled:bg-gray-200 disabled:cursor-not-allowed border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center space-x-1 sm:space-x-2"
    >
      <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4`} />
      <span>{'Retry'}</span>
    </button>
  )

  /* ── render ── */
  if (isLoading) return <Banner msg="Fetching transactions…" />

  if (error)
    return (
      <div className="p-2 sm:p-4 bg-red-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
        <div className="flex flex-col sm:flex-row sm:items-center">
          <span className="mb-2 sm:mb-0">{error}</span>
          <RetryBtn />
        </div>
      </div>
    )

  if (!transactions.length)
    return (
      <>
      <div className="p-2 sm:p-4 bg-yellow-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
        <div className="flex flex-col sm:flex-row sm:items-center">
          <span className="mb-2 sm:mb-0">No transactions found for this NFT.</span>
        </div>
      </div>
      <RetryBtn />
      </>
    )

  return (
    <div className="w-full">
      {/* Mobile Card View - Hidden on larger screens */}
      <div className="block sm:hidden space-y-2">
        {transactions.map((tx, i) => (
          <div
            key={tx.hash}
            className={`p-3 border-2 border-black ${i % 2 ? "bg-gray-50" : "bg-white"} hover:bg-yellow-100 space-y-2`}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-black text-xs text-orange-600 uppercase">{tx.transaction_type}</div>
                <div className="font-bold text-sm">${tx.sale_price_usd.toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-xs">{format(new Date(tx.timestamp), "MMM dd")}</div>
                <div className="font-bold text-xs text-gray-600">{format(new Date(tx.timestamp), "HH:mm")}</div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs">
              <div className="font-bold uppercase text-gray-700">{tx.marketplace}</div>
              <span
                className={`px-1 py-0.5 border border-black rounded text-xs font-bold ${
                  tx.is_washtrade === "Not Washtrade" ? "bg-green-200" : "bg-red-200"
                }`}
              >
                {tx.is_washtrade === "Not Washtrade" ? "✓" : "⚠"}
              </span>
            </div>

            <div className="text-xs space-y-1">
              <div>
                <span className="text-gray-600">From:</span>{" "}
                <span className="font-bold">
                  {tx.sending_address.slice(0, 4)}…{tx.sending_address.slice(-3)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">To:</span>{" "}
                <span className="font-bold">
                  {tx.receiving_address.slice(0, 4)}…{tx.receiving_address.slice(-3)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View - Hidden on mobile */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-orange-200 border-2 sm:border-4 border-black">
              <th className="p-1 sm:p-2 text-left font-black text-xs sm:text-sm">Date</th>
              <th className="p-1 sm:p-2 text-left font-black text-xs sm:text-sm">Type</th>
              <th className="p-1 sm:p-2 text-left font-black text-xs sm:text-sm">Price (USD)</th>
              <th className="p-1 sm:p-2 text-left font-black text-xs sm:text-sm">Marketplace</th>
              <th className="p-1 sm:p-2 text-left font-black text-xs sm:text-sm hidden md:table-cell">From</th>
              <th className="p-1 sm:p-2 text-left font-black text-xs sm:text-sm hidden md:table-cell">To</th>
              <th className="p-1 sm:p-2 text-left font-black text-xs sm:text-sm">Wash Trade</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, i) => (
              <tr
                key={tx.hash}
                className={`border-2 sm:border-4 border-black ${i % 2 ? "bg-gray-50" : "bg-white"} hover:bg-yellow-100`}
              >
                <td className="p-1 sm:p-2 font-bold text-xs sm:text-sm">
                  <div className="sm:hidden">{format(new Date(tx.timestamp), "MMM dd")}</div>
                  <div className="hidden sm:block">{format(new Date(tx.timestamp), "MMM dd, yyyy HH:mm")}</div>
                </td>
                <td className="p-1 sm:p-2 font-bold uppercase text-xs sm:text-sm">{tx.transaction_type}</td>
                <td className="p-1 sm:p-2 font-bold text-xs sm:text-sm">${tx.sale_price_usd.toFixed(2)}</td>
                <td className="p-1 sm:p-2 font-bold uppercase text-xs sm:text-sm">{tx.marketplace}</td>
                <td className="p-1 sm:p-2 font-bold text-xs sm:text-sm hidden md:table-cell">
                  {tx.sending_address.slice(0, 6)}…{tx.sending_address.slice(-4)}
                </td>
                <td className="p-1 sm:p-2 font-bold text-xs sm:text-sm hidden md:table-cell">
                  {tx.receiving_address.slice(0, 6)}…{tx.receiving_address.slice(-4)}
                </td>
                <td className="p-1 sm:p-2 font-bold text-xs sm:text-sm">
                  <span
                    className={`px-1 sm:px-2 py-0.5 sm:py-1 border border-black sm:border-2 rounded text-xs ${
                      tx.is_washtrade === "Not Washtrade" ? "bg-green-200" : "bg-red-200"
                    }`}
                  >
                    <span className="sm:hidden">{tx.is_washtrade === "Not Washtrade" ? "✓" : "⚠"}</span>
                    <span className="hidden sm:inline">{tx.is_washtrade}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default NftTransaction
