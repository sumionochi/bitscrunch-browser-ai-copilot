"use client"

import type React from "react"
import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import axios from "axios"
import { Card, CardContent } from "./ui/card"
import { format, isValid, parseISO } from "date-fns"
import { LoaderCircle, CheckCircle, XCircle } from "lucide-react"

/* ════════════════  TYPES  ════════════════ */
interface NftAnalyticsProps {
  blockchain: string
  contractAddress: string
  tokenId: string
  timeRange: string
  apiKey: string
}

interface AnalyticsData {
  block_dates: string[]
  performance_trend: number[]
  market_activity_trend: number[]
  price_trend: number[]
  volume_trend: number[]
  assets: number
  assets_change: number | null
  sales: number
  sales_change: number | null
  transactions: number
  transactions_change: number | null
  transfers: number
  transfers_change: number | null
  volume: number
  volume_change: number | null
  updated_at: string
}

interface WashtradeData {
  washtrade_assets: string
  washtrade_assets_change: number | null
  washtrade_suspect_sales: string
  washtrade_suspect_sales_change: number | null
  washtrade_suspect_transactions: string
  washtrade_suspect_transactions_change: number | null
  washtrade_volume: number
  washtrade_volume_change: number | null
  washtrade_wallets: string
  washtrade_wallets_change: number | null
}

interface OwnerData {
  hold_duration: number
  owner: number
  owner_change: number
  past_owners_count: number
  wallet_holder_new: string[]
  max_date: string
}

interface ScoresData {
  all_time_low: number
  estimated_price: number | null
  max_price: number
  price: number
  price_ceiling: number
  rarity_rank: number
  rarity_score: number
  start_price: number
  washtrade_status: string
}

interface CacheData {
  data: any
  timestamp: number
  expiresIn: number
}

interface LoadingState {
  analytics: boolean
  washtrade: boolean
  owner: boolean
  scores: boolean
}

interface SequentialTaskStatus {
  name: "analytics" | "washtrade" | "owner" | "scores"
  status: "pending" | "loading" | "success" | "error"
  message: string
}

/* ════════════════  CONSTANTS  ════════════════ */
const CACHE_DURATION = {
  ANALYTICS: 5 * 60 * 1000,
  WASHTRADE: 5 * 60 * 1000,
  OWNER: 5 * 60 * 1000,
  SCORES: 5 * 60 * 1000,
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

// Helper function to safely format dates
const safeFormatDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString)
    if (isValid(date)) {
      return format(date, "MMM dd, yyyy HH:mm")
    }
  } catch (error) {
    console.warn(`Invalid date string: ${dateString}`)
  }
  return dateString // Return original string if parsing fails
}

const LoadingBanner = ({ msg }: { msg: string }) => (
  <div className="flex items-center space-x-1 sm:space-x-2 p-2 sm:p-4 bg-blue-100 border-2 sm:border-4 border-black">
    <LoaderCircle className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600 flex-shrink-0" />
    <span className="font-bold text-xs sm:text-sm">{msg}</span>
  </div>
)

/* ════════════════  COMPONENT  ════════════════ */
const NftAnalytics: React.FC<NftAnalyticsProps> = ({ blockchain, contractAddress, tokenId, timeRange, apiKey }) => {
  /* ── data state ── */
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [washtrade, setWashtrade] = useState<WashtradeData | null>(null)
  const [owner, setOwner] = useState<OwnerData | null>(null)
  const [scores, setScores] = useState<ScoresData | null>(null)
  const [, setChartData] = useState<
    { timestamp: string; performance: number; market_activity: number; price: number; volume: number }[]
  >([])

  /* ── loading & progress ── */
  const [loadingStates, setLoadingStates] = useState<LoadingState>({
    analytics: false,
    washtrade: false,
    owner: false,
    scores: false,
  })
  const [seqTasks, setSeqTasks] = useState<SequentialTaskStatus[]>([])
  const [isSeqLoading, setIsSeqLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ── cache & debounce ── */
  const cacheRef = useRef<Record<string, CacheData>>({})
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const keyOf = (ep: string, p: any) => `${ep}_${JSON.stringify(p)}`
  const getCached = (k: string) =>
    cacheRef.current[k] && Date.now() < cacheRef.current[k].timestamp + cacheRef.current[k].expiresIn
      ? cacheRef.current[k].data
      : null
  const setCached = (k: string, d: any, ex: number) =>
    (cacheRef.current[k] = { data: d, timestamp: Date.now(), expiresIn: ex })

  /* ── helpers ── */
  const setLoad = (k: keyof LoadingState, v: boolean) => setLoadingStates((p) => ({ ...p, [k]: v }))
  const initSeq = () =>
    setSeqTasks([
      { name: "analytics", status: "pending", message: "Waiting…" },
      { name: "washtrade", status: "pending", message: "Waiting…" },
      { name: "owner", status: "pending", message: "Waiting…" },
      { name: "scores", status: "pending", message: "Waiting…" },
    ])
  const updSeq = (name: SequentialTaskStatus["name"], status: SequentialTaskStatus["status"], message: string) =>
    setSeqTasks((p) => p.map((t) => (t.name === name ? { ...t, status, message } : t)))

  /* ════════════════  FETCHERS  ════════════════ */
  /** 1️⃣  NFT Analytics */
  const fetchAnalytics = useCallback(async () => {
    if (!apiKey) return false
    const params = {
      blockchain,
      contract_address: [contractAddress],
      token_id: [tokenId],
      time_range: timeRange,
      sort_by: "sales",
    }
    const key = keyOf("analytics", params)
    const cached = getCached(key)
    if (cached) {
      setAnalytics(cached)
      updSeq("analytics", "success", "Loaded from cache")
      return true
    }
    setLoad("analytics", true)
    updSeq("analytics", "loading", "Fetching analytics…")
    try {
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/analytics", {
        params,
        headers: { "x-api-key": apiKey },
      })
      const data: AnalyticsData = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      const arr = <T extends string | number = string | number>(v: unknown): T[] =>
        Array.isArray(v) ? (v as T[]) : parseBraceArray<T>(String(v))
      const trend: AnalyticsData = {
        ...data,
        block_dates: arr<string>(data.block_dates),
        performance_trend: arr<number>(data.performance_trend),
        market_activity_trend: arr<number>(data.market_activity_trend),
        price_trend: arr<number>(data.price_trend),
        volume_trend: arr<number>(data.volume_trend),
      }
      setAnalytics(trend)
      setCached(key, trend, CACHE_DURATION.ANALYTICS)
      updSeq("analytics", "success", "Analytics loaded")
      if (trend.block_dates.length) {
        const formatted = trend.block_dates.map((d, i) => ({
          timestamp: safeFormatDate(d),
          performance: trend.performance_trend[i] || 0,
          market_activity: trend.market_activity_trend[i] || 0,
          price: trend.price_trend[i] || 0,
          volume: trend.volume_trend[i] || 0,
        }))
        setChartData(formatted)
      }
      return true
    } catch (e) {
      console.error("analytics error", e)
      updSeq("analytics", "error", "Failed analytics")
      setError("Failed to fetch NFT analytics")
      return false
    } finally {
      setLoad("analytics", false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange])

  /** 2️⃣  Wash-trade */
  const fetchWashtrade = useCallback(async () => {
    if (!apiKey) return false
    const params = {
      blockchain,
      contract_address: [contractAddress],
      token_id: [tokenId],
      time_range: timeRange,
      sort_by: "washtrade_volume",
    }
    const key = keyOf("washtrade", params)
    const cached = getCached(key)
    if (cached) {
      setWashtrade(cached)
      updSeq("washtrade", "success", "Loaded from cache")
      return true
    }
    setLoad("washtrade", true)
    updSeq("washtrade", "loading", "Fetching washtrade…")
    try {
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/washtrade", {
        params,
        headers: { "x-api-key": apiKey },
      })
      const data: WashtradeData = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setWashtrade(data)
      setCached(key, data, CACHE_DURATION.WASHTRADE)
      updSeq("washtrade", "success", "Washtrade loaded")
      return true
    } catch (e) {
      console.error("washtrade error", e)
      updSeq("washtrade", "error", "Failed washtrade")
      setError("Failed to fetch wash-trade data")
      return false
    } finally {
      setLoad("washtrade", false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange])

  /** 3️⃣  Current owners - FIXED: Added token_id as required parameter */
  const fetchOwner = useCallback(async () => {
    if (!apiKey) return false
    const params = {
      blockchain,
      contract_address: contractAddress,
      token_id: tokenId, // ✅ FIXED: Added token_id as required parameter
      time_range: "all",
      sort_by: "acquired_date",
    }
    const key = keyOf("owner", params)
    const cached = getCached(key)
    if (cached) {
      setOwner(cached)
      updSeq("owner", "success", "Loaded from cache")
      return true
    }
    setLoad("owner", true)
    updSeq("owner", "loading", "Fetching owners…")
    try {
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/owner", {
        params,
        headers: { "x-api-key": apiKey },
      })
      // response is an *array* of owners; you kept only the first
      const data: OwnerData = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setOwner(data)
      setCached(key, data, CACHE_DURATION.OWNER)
      updSeq("owner", "success", "Owners loaded")
      return true
    } catch (e) {
      console.error("owner error", e)
      updSeq("owner", "error", "Failed owners")
      setError("Failed to fetch owner data")
      return false
    } finally {
      setLoad("owner", false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId]) // ✅ FIXED: Added tokenId back to dependencies

  /** 4️⃣  Scores */
  const fetchScores = useCallback(async () => {
    if (!apiKey) return false
    const params = {
      blockchain,
      contract_address: [contractAddress],
      token_id: [tokenId],
      time_range: timeRange,
      sort_by: "price_ceiling",
    }
    const key = keyOf("scores", params)
    const cached = getCached(key)
    if (cached) {
      setScores(cached)
      updSeq("scores", "success", "Loaded from cache")
      return true
    }
    setLoad("scores", true)
    updSeq("scores", "loading", "Fetching scores…")
    try {
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/scores", {
        params,
        headers: { "x-api-key": apiKey },
      })
      const data: ScoresData = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setScores(data)
      setCached(key, data, CACHE_DURATION.SCORES)
      updSeq("scores", "success", "Scores loaded")
      return true
    } catch (e) {
      console.error("scores error", e)
      updSeq("scores", "error", "Failed scores")
      setError("Failed to fetch scores data")
      return false
    } finally {
      setLoad("scores", false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange])

  /* ════════════════  ORCHESTRATOR  ════════════════ */
  const sequentialFetch = useCallback(async () => {
    if (!apiKey) return
    setIsSeqLoading(true)
    initSeq()
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    try {
      await fetchAnalytics()
      await delay(300)
      await fetchWashtrade()
      await delay(300)
      await fetchOwner()
      await delay(300)
      await fetchScores()
    } finally {
      setIsSeqLoading(false)
      setTimeout(() => setSeqTasks([]), 2000)
    }
  }, [fetchAnalytics, fetchWashtrade, fetchOwner, fetchScores, apiKey])

  /* ════════════════  DEBOUNCE  ════════════════ */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(sequentialFetch, 300)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [blockchain, contractAddress, tokenId, timeRange, apiKey, sequentialFetch])

  /* ════════════════  UI  ════════════════ */
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

  if (error)
    return (
      <div className="p-2 sm:p-4 bg-red-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
        {error}
      </div>
    )

  if (
    (!analytics || !washtrade || !owner || !scores) &&
    (loadingStates.analytics || loadingStates.washtrade || loadingStates.owner || loadingStates.scores)
  )
    return <LoadingBanner msg="Loading analytics…" />

  if (!analytics) {
    return (
      <div className="p-2 sm:p-4 bg-yellow-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
        No analytics data available.
      </div>
    )
  }

  /* ════════════════  MARKUP  ════════════════ */
  return (
    <Fragment>
      {(isSeqLoading || seqTasks.length > 0) && <SequentialProgress />}
      {(loadingStates.analytics || loadingStates.washtrade || loadingStates.owner || loadingStates.scores) && (
        <div className="bg-blue-50 border-2 sm:border-4 border-black p-1 sm:p-2 mb-2 sm:mb-4">
          {loadingStates.analytics && <LoadingBanner msg="Updating analytics…" />}
          {loadingStates.washtrade && <LoadingBanner msg="Updating washtrade…" />}
          {loadingStates.owner && <LoadingBanner msg="Updating owner…" />}
          {loadingStates.scores && <LoadingBanner msg="Updating scores…" />}
        </div>
      )}
      {/* ───────────  MAIN CARDS (same markup as original) ─────────── */}
      {/* Trading, assets, sales, transactions, transfers */}
      <Card className="bg-white border-2 sm:border-4 border-black p-2 sm:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
        <CardContent className="p-0">
          <h2 className="text-lg sm:text-xl font-black mb-2 sm:mb-4">Analytics of NFT</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6">
            {/* Volume */}
            <div className="space-y-1 sm:space-y-2 bg-purple-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Trading Volume (USD)</h3>
              <p className="text-xl sm:text-3xl font-black">
                {(() => {
                  if (analytics.volume_trend.length) {
                    const lastValue = analytics.volume_trend[analytics.volume_trend.length - 1]
                    const numValue = Number(lastValue)
                    return `${isNaN(numValue) ? "0.00" : numValue.toFixed(2)}`
                  }
                  const numVolume = Number(analytics.volume)
                  return `${isNaN(numVolume) ? "0.00" : numVolume.toFixed(2)}`
                })()}
              </p>
              {analytics.volume_change !== null && (
                <p
                  className={`text-xs sm:text-sm font-bold ${
                    Number(analytics.volume_change) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {(Number(analytics.volume_change) * 100).toFixed(2)}% change
                </p>
              )}
            </div>
            {/* Assets */}
            <div className="space-y-1 sm:space-y-2 bg-pink-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Assets</h3>
              <p className="text-xl sm:text-3xl font-black">{Number(analytics.assets) || 0}</p>
              {analytics.assets_change !== null && (
                <p
                  className={`text-xs sm:text-sm font-bold ${
                    Number(analytics.assets_change) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {(Number(analytics.assets_change) * 100).toFixed(2)}% change
                </p>
              )}
            </div>
            {/* Sales */}
            <div className="space-y-1 sm:space-y-2 bg-orange-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Sales</h3>
              <p className="text-xl sm:text-3xl font-black">{Number(analytics.sales) || 0}</p>
              {analytics.sales_change !== null && (
                <p
                  className={`text-xs sm:text-sm font-bold ${
                    Number(analytics.sales_change) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {(Number(analytics.sales_change) * 100).toFixed(2)}% change
                </p>
              )}
            </div>
            {/* Transactions */}
            <div className="space-y-1 sm:space-y-2 bg-indigo-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Transactions</h3>
              <p className="text-xl sm:text-3xl font-black">{Number(analytics.transactions) || 0}</p>
              {analytics.transactions_change !== null && (
                <p
                  className={`text-xs sm:text-sm font-bold ${
                    Number(analytics.transactions_change) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {(Number(analytics.transactions_change) * 100).toFixed(2)}% change
                </p>
              )}
            </div>
            {/* Transfers */}
            <div className="space-y-1 sm:space-y-2 bg-teal-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Transfers</h3>
              <p className="text-xl sm:text-3xl font-black">{Number(analytics.transfers) || 0}</p>
              {analytics.transfers_change !== null && (
                <p
                  className={`text-xs sm:text-sm font-bold ${
                    Number(analytics.transfers_change) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {(Number(analytics.transfers_change) * 100).toFixed(2)}% change
                </p>
              )}
            </div>
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 mt-2 sm:mt-4 p-2 sm:p-4 bg-gray-100 border-2 sm:border-4 border-black">
              <p className="text-xs sm:text-sm font-bold">
                Last Updated: {new Date(analytics.updated_at).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* ───────── Wash-trade card ───────── */}
      <Card className="bg-white border-2 sm:border-4 border-black p-2 sm:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
        <CardContent className="p-0">
          <h2 className="text-lg sm:text-xl font-black mb-2 sm:mb-4">Wash-trade Metrics</h2>
          {/* helper so we don't repeat Number() everywhere */}
          {(() => {
            const n = (v: unknown) => Number(v ?? 0)
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6">
                {/* Suspect sales */}
                <div className="space-y-1 sm:space-y-2 bg-red-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Suspect Sales</h3>
                  <p className="text-xl sm:text-3xl font-black">{n(washtrade?.washtrade_suspect_sales)}</p>
                  {washtrade?.washtrade_suspect_sales_change != null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        n(washtrade.washtrade_suspect_sales_change) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(n(washtrade.washtrade_suspect_sales_change) * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
                {/* Wash-trade volume */}
                <div className="space-y-1 sm:space-y-2 bg-yellow-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Wash-trade Volume</h3>
                  <p className="text-xl sm:text-3xl font-black">${n(washtrade?.washtrade_volume).toFixed(2)}</p>
                  {washtrade?.washtrade_volume_change != null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        n(washtrade.washtrade_volume_change) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(n(washtrade.washtrade_volume_change) * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
                {/* Suspect transactions */}
                <div className="space-y-1 sm:space-y-2 bg-green-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Suspect Transactions</h3>
                  <p className="text-xl sm:text-3xl font-black">{n(washtrade?.washtrade_suspect_transactions)}</p>
                  {washtrade?.washtrade_suspect_transactions_change != null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        n(washtrade.washtrade_suspect_transactions_change) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(n(washtrade.washtrade_suspect_transactions_change) * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
                {/* Wallets */}
                <div className="space-y-1 sm:space-y-2 bg-blue-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Wash-trade Wallets</h3>
                  <p className="text-xl sm:text-3xl font-black">{n(washtrade?.washtrade_wallets)}</p>
                  {washtrade?.washtrade_wallets_change != null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        n(washtrade.washtrade_wallets_change) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(n(washtrade.washtrade_wallets_change) * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>
      {/* ───────── owner card ───────── */}
      <Card className="bg-white border-2 sm:border-4 border-black p-2 sm:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
        <CardContent className="p-0">
          <h2 className="text-lg sm:text-xl font-black mb-2 sm:mb-4">Owner Information</h2>
          {(() => {
            const n = (v: unknown) => Number(v ?? 0)
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6">
                {/* Current owner */}
                <div className="space-y-1 sm:space-y-2 bg-purple-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Current Owner</h3>
                  <p className="text-xl sm:text-3xl font-black">{n(owner?.owner)}</p>
                  {owner?.owner_change != null && (
                    <p
                      className={`text-xs sm:text-sm font-bold ${
                        owner.owner_change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(owner.owner_change * 100).toFixed(2)}% change
                    </p>
                  )}
                </div>
                {/* Past owners */}
                <div className="space-y-1 sm:space-y-2 bg-orange-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Past Owners</h3>
                  <p className="text-xl sm:text-3xl font-black">{n(owner?.past_owners_count)}</p>
                </div>
                {/* Hold duration */}
                <div className="space-y-1 sm:space-y-2 bg-pink-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Hold Duration (days)</h3>
                  <p className="text-xl sm:text-3xl font-black">{n(owner?.hold_duration)}</p>
                </div>
                {/* Last updated */}
                <div className="space-y-1 sm:space-y-2 bg-indigo-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-sm sm:text-lg">Last Updated</h3>
                  <p className="text-sm sm:text-lg font-bold">
                    {owner?.max_date ? new Date(owner.max_date).toLocaleDateString() : "N/A"}
                  </p>
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>
      {/* Scores card */}
      <Card className="bg-white border-2 sm:border-4 border-black p-2 sm:p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
        <CardContent className="p-0">
          <h2 className="text-lg sm:text-xl font-black mb-2 sm:mb-4">NFT Scores</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6">
            {/* Price range */}
            <div className="space-y-1 sm:space-y-2 bg-yellow-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Price Range (USD)</h3>
              <div className="space-y-0.5 sm:space-y-1">
                <p className="text-xs sm:text-sm font-bold">Current: ${Number(scores?.price || 0).toFixed(2)}</p>
                <p className="text-xs sm:text-sm font-bold">
                  All-time Low: ${Number(scores?.all_time_low || 0).toFixed(2)}
                </p>
                <p className="text-xs sm:text-sm font-bold">
                  All-time High: ${Number(scores?.max_price || 0).toFixed(2)}
                </p>
              </div>
            </div>
            {/* Rarity */}
            <div className="space-y-1 sm:space-y-2 bg-green-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Rarity</h3>
              <p className="text-xl sm:text-3xl font-black">{Number(scores?.rarity_score || 0).toFixed(2)}</p>
              <p className="text-xs sm:text-sm font-bold">Rank: #{Number(scores?.rarity_rank || 0)}</p>
            </div>
            {/* Price estimates */}
            <div className="space-y-1 sm:space-y-2 bg-blue-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Price Estimates</h3>
              <p className="text-sm sm:text-lg font-bold">
                Estimated: ${Number(scores?.estimated_price || 0).toFixed(2)}
              </p>
              <p className="text-sm sm:text-lg font-bold">Ceiling: ${Number(scores?.price_ceiling || 0).toFixed(2)}</p>
            </div>
            {/* Washtrade status */}
            <div className="space-y-1 sm:space-y-2 bg-red-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
              <h3 className="font-black text-sm sm:text-lg">Washtrade Status</h3>
              <p
                className={`text-xl sm:text-3xl font-black ${
                  scores?.washtrade_status === "false" ? "text-green-600" : "text-red-600"
                }`}
              >
                {scores?.washtrade_status === "false" ? "Clean" : "Suspicious"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Fragment>
  )
}

export default NftAnalytics
