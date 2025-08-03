"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState, Fragment } from "react"
import axios from "axios"
import { Card, CardContent } from "./ui/card"
import { format } from "date-fns"
import TraderChart from "./TraderChart"
import { LoaderCircle, CheckCircle, XCircle, RefreshCw } from "lucide-react"

/* ════════════════  TYPES  ════════════════ */
interface TraderMetrics {
  blockchain: string
  chain_id: number
  contract_address: string
  token_id: string
  traders: number
  traders_buyers: number
  traders_buyers_change: number | null
  traders_change: number | null
  traders_sellers: number
  traders_sellers_change: number | null
  updated_at: string
}

interface NftTradersProps {
  blockchain: string
  contractAddress: string
  tokenId: string
  timeRange: string
  apiKey: string
}

interface CacheData {
  data: any
  timestamp: number
  expiresIn: number
}

interface LoadingState {
  metrics: boolean
  history: boolean
}

interface SequentialTaskStatus {
  name: "metrics" | "history"
  status: "pending" | "loading" | "success" | "error"
  message: string
}

/* ════════════════  CONSTANTS & UTILS  ════════════════ */
const CACHE_DURATION = {
  METRICS: 5 * 60 * 1000,
  HISTORY: 5 * 60 * 1000,
}

const parseBraceArray = <T extends string | number = string>(raw: string): T[] =>
  raw
    .replace(/^{|}$/g, "")
    .split(",")
    .map((v) => v.trim().replace(/^"|"$/g, ""))
    .map((v) => {
      const n = Number(v)
      return (isNaN(n) ? v : n) as T
    })

const LoadingBanner = ({ msg }: { msg: string }) => (
  <div className="flex items-center space-x-1 sm:space-x-2 p-2 sm:p-4 bg-blue-100 border-2 sm:border-4 border-black">
    <LoaderCircle className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600 flex-shrink-0" />
    <span className="font-bold text-xs sm:text-sm">{msg}</span>
  </div>
)

/* ════════════════  COMPONENT  ════════════════ */
const NftTraders: React.FC<NftTradersProps> = ({ blockchain, contractAddress, tokenId, timeRange, apiKey }) => {
  /* ── state ── */
  const [metrics, setMetrics] = useState<TraderMetrics | null>(null)
  const [chartData, setChartData] = useState<{ date: string; traders: number; buyers: number; sellers: number }[]>([])
  const [sortBy, setSortBy] = useState("traders")
  const [showChart, setShowChart] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingStates, setLoadingStates] = useState<LoadingState>({
    metrics: false,
    history: false,
  })
  const [seqTasks, setSeqTasks] = useState<SequentialTaskStatus[]>([])
  const [isSeqLoading, setIsSeqLoading] = useState(false)

  /* ── cache & debounce ── */
  const cacheRef = useRef<Record<string, CacheData>>({})
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  /* ── cache helpers ── */
  const keyOf = (ep: string, p: any) => `${ep}_${JSON.stringify(p)}`
  const getCached = (k: string) =>
    cacheRef.current[k] && Date.now() < cacheRef.current[k].timestamp + cacheRef.current[k].expiresIn
      ? cacheRef.current[k].data
      : null
  const setCached = (k: string, d: any, ex: number) =>
    (cacheRef.current[k] = { data: d, timestamp: Date.now(), expiresIn: ex })

  /* ── seq helpers ── */
  const initSeq = () =>
    setSeqTasks([
      { name: "metrics", status: "pending", message: "Waiting…" },
      { name: "history", status: "pending", message: "Waiting…" },
    ])
  const updSeq = (name: "metrics" | "history", status: SequentialTaskStatus["status"], message: string) =>
    setSeqTasks((p) => p.map((t) => (t.name === name ? { ...t, status, message } : t)))
  const setLoad = (k: keyof LoadingState, v: boolean) => setLoadingStates((p) => ({ ...p, [k]: v }))

  /* ── fetch metrics ── */
  const fetchMetrics = useCallback(async () => {
    if (!apiKey) return false
    const params = {
      blockchain,
      contract_address: contractAddress,
      token_id: [tokenId],
      time_range: timeRange,
      sort_by: sortBy,
    }
    const key = keyOf("metrics", params)
    const cached = getCached(key)
    if (cached) {
      setMetrics(cached)
      updSeq("metrics", "success", "Loaded from cache")
      return true
    }
    setLoad("metrics", true)
    updSeq("metrics", "loading", "Fetching metrics…")
    try {
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/traders", {
        params,
        headers: { "x-api-key": apiKey },
      })
      const data = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setMetrics(data)
      setCached(key, data, CACHE_DURATION.METRICS)
      updSeq("metrics", "success", "Metrics loaded")
      return true
    } catch (e) {
      console.error("metrics error", e)
      updSeq("metrics", "error", "Failed metrics")
      setError("Failed to fetch trader metrics")
      return false
    } finally {
      setLoad("metrics", false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange, sortBy])

  /* ── fetch history ── */
  const fetchHistory = useCallback(async () => {
    if (!apiKey) return false
    const params = {
      blockchain,
      contract_address: contractAddress,
      token_id: [tokenId],
      time_range: timeRange,
    }
    const key = keyOf("history", params)
    const cached = getCached(key)
    if (cached) {
      setChartData(cached)
      updSeq("history", "success", "Loaded from cache")
      return true
    }
    setLoad("history", true)
    updSeq("history", "loading", "Fetching history…")
    try {
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/market-insights/traders", {
        params,
        headers: { "x-api-key": apiKey },
      })
      const h = res.data.data[0]
      /* brace-array safety */
      const dates = typeof h.block_dates === "string" ? parseBraceArray<string>(h.block_dates) : h.block_dates
      const traders = typeof h.traders_trend === "string" ? parseBraceArray<number>(h.traders_trend) : h.traders_trend
      const buyers =
        typeof h.traders_buyers_trend === "string"
          ? parseBraceArray<number>(h.traders_buyers_trend)
          : h.traders_buyers_trend
      const sellers =
        typeof h.traders_sellers_trend === "string"
          ? parseBraceArray<number>(h.traders_sellers_trend)
          : h.traders_sellers_trend
      const formatted = dates.map((d: string, i: number) => ({
        date: format(new Date(d), "MMM dd, yyyy HH:mm"),
        traders: traders[i],
        buyers: buyers[i],
        sellers: sellers[i],
      }))
      setChartData(formatted)
      setCached(key, formatted, CACHE_DURATION.HISTORY)
      updSeq("history", "success", "History loaded")
      return true
    } catch (e) {
      console.error("history error", e)
      updSeq("history", "error", "Failed history")
      setError("Failed to fetch trader history")
      return false
    } finally {
      setLoad("history", false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange])

  /* ── orchestrator ── */
  const sequentialFetch = useCallback(async () => {
    if (!apiKey) return
    setIsSeqLoading(true)
    setError(null) // Clear any previous errors
    initSeq()
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    try {
      await fetchMetrics()
      await delay(300)
      await fetchHistory()
    } finally {
      setIsSeqLoading(false)
      setTimeout(() => setSeqTasks([]), 2000)
    }
  }, [fetchMetrics, fetchHistory, apiKey])

  /* ── manual retry handler ── */
  const handleRetry = useCallback(() => {
    console.log("Manual retry triggered")
    sequentialFetch()
  }, [sequentialFetch])

  /* ── debounce trigger ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(sequentialFetch, 300)
    // ✅ cleanup → void
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null // reset the ref
      }
    }
  }, [blockchain, contractAddress, tokenId, timeRange, sortBy, sequentialFetch])

  /* ════════════════  UI ════════════════ */
  const SequentialProgress = () => (
    <div className="bg-blue-100 border-2 sm:border-4 border-black p-2 sm:p-3 mb-2 sm:mb-4">
      {seqTasks.map((t) => (
        <div
          key={t.name}
          className="flex items-center space-x-1 sm:space-x-2 bg-white p-1 sm:p-2 border border-black sm:border-2 mb-1"
        >
          {t.status === "pending" && (
            <div className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-gray-400 rounded-full flex-shrink-0" />
          )}
          {t.status === "loading" && (
            <LoaderCircle className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-blue-600 flex-shrink-0" />
          )}
          {t.status === "success" && <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />}
          {t.status === "error" && <XCircle className="h-3 w-3 sm:h-4 sm:w-4 text-red-600 flex-shrink-0" />}
          <span className="text-xs font-bold capitalize flex-shrink-0">{t.name}</span>
          <span className="text-[10px] sm:text-xs flex-grow truncate">{t.message}</span>
        </div>
      ))}
    </div>
  )

  const sortOptions = [
    { value: "traders", label: "Total Traders" },
    { value: "traders_change", label: "Traders Change" },
    { value: "traders_buyers", label: "Buyers" },
    { value: "traders_buyers_change", label: "Buyers Change" },
    { value: "traders_sellers", label: "Sellers" },
    { value: "traders_sellers_change", label: "Sellers Change" },
    { value: "traders_ratio", label: "Traders Ratio" },
    { value: "traders_ratio_change", label: "Traders Ratio Change" },
  ]

  /* ════════════════  RENDER  ════════════════ */
  if (error)
    return (
      <div className="space-y-2 sm:space-y-4">
        <div className="p-2 sm:p-4 bg-red-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
          {error}
        </div>
        <button
          onClick={handleRetry}
          disabled={isSeqLoading}
          className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 font-bold text-xs sm:text-sm bg-red-200 hover:bg-red-300 disabled:bg-gray-200 disabled:cursor-not-allowed border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center space-x-1 sm:space-x-2"
        >
          <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${isSeqLoading ? 'animate-spin' : ''}`} />
          <span>{isSeqLoading ? 'Retrying...' : 'Retry'}</span>
        </button>
      </div>
    )

  if (!metrics && (loadingStates.metrics || loadingStates.history)) return <LoadingBanner msg="Loading trader data…" />

  return (
    <Fragment>
      {(isSeqLoading || seqTasks.length > 0) && <SequentialProgress />}
      {(loadingStates.metrics || loadingStates.history) && (
        <div className="bg-blue-50 border-2 sm:border-4 border-black p-1 sm:p-2 mb-2 sm:mb-4">
          {loadingStates.metrics && <LoadingBanner msg="Updating metrics…" />}
          {loadingStates.history && <LoadingBanner msg="Updating history…" />}
        </div>
      )}
      {metrics && (
        <div className="space-y-2 sm:space-y-4">
          {/* ── controls & chart ── */}
          <div className="w-full bg-white p-2 sm:p-4 border-2 sm:border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4 mb-2 sm:mb-4">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value)
                  console.log("Sorting by:", e.target.value) // Added console.log here
                }}
                className="w-full sm:flex-1 h-10 sm:h-12 text-xs sm:text-sm bg-white font-black uppercase border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all p-1 sm:p-2 cursor-pointer"
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value} className="font-bold">
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowChart(!showChart)}
                  className={`w-full sm:w-auto px-4 sm:px-6 py-1 sm:py-2 font-bold text-xs sm:text-sm ${
                    showChart ? "bg-orange-200" : "bg-blue-200"
                  } border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all`}
                >
                  {showChart ? "Hide Chart" : "Show Chart"}
                </button>
                <button
                  onClick={handleRetry}
                  disabled={isSeqLoading}
                  className="w-full sm:w-auto px-4 sm:px-6 py-1 sm:py-2 font-bold text-xs sm:text-sm bg-green-200 hover:bg-green-300 disabled:bg-gray-200 disabled:cursor-not-allowed border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center space-x-1 sm:space-x-2"
                >
                  <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${isSeqLoading ? 'animate-spin' : ''}`} />
                  <span>{isSeqLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>
            </div>
            {showChart && chartData.length > 0 && (
              <div className="mt-2 sm:mt-4 border-2 sm:border-4 border-black p-2 sm:p-4">
                <TraderChart data={chartData} />
              </div>
            )}
          </div>
          {/* ── metrics card ── */}
          <Card className="bg-white border-2 sm:border-4 p-2 sm:p-6 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
            <CardContent className="p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6">
                {/* Total traders */}
                <div className="space-y-1 sm:space-y-2 bg-blue-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Total Traders</h3>
                  <p className="text-xl sm:text-3xl font-black">{metrics.traders}</p>
                  {metrics.traders_change !== null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        metrics.traders_change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(metrics.traders_change * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
                {/* Buyers */}
                <div className="space-y-1 sm:space-y-2 bg-green-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Buyers</h3>
                  <p className="text-xl sm:text-3xl font-black">{metrics.traders_buyers}</p>
                  {metrics.traders_buyers_change !== null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        metrics.traders_buyers_change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(metrics.traders_buyers_change * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
                {/* Sellers */}
                <div className="space-y-1 sm:space-y-2 bg-red-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Sellers</h3>
                  <p className="text-xl sm:text-3xl font-black">{metrics.traders_sellers}</p>
                  {metrics.traders_sellers_change !== null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        metrics.traders_sellers_change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(metrics.traders_sellers_change * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2 sm:mt-4 p-2 sm:p-4 bg-yellow-100 border-2 sm:border-4 border-black">
                <p className="text-xs sm:text-sm font-bold">
                  Last Updated: {new Date(metrics.updated_at).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Fragment>
  )
}

export default NftTraders