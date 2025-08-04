"use client"

import type React from "react"
import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import axios from "axios"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import { format, isValid, parseISO } from "date-fns"
import {
  LoaderCircle,
  CheckCircle,
  XCircle,
  Send,
  Bot,
  MessageCircle,
  X,
  Minimize2,
  Maximize2,
} from "lucide-react"

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts"

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

/* ════════════════  AI Chat types  ════════════════ */
interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface ChatState {
  messages: ChatMessage[]
  isOpen: boolean
  isMinimized: boolean
  isStreaming: boolean
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

const safeFormatDate = (d: string) => {
  try {
    const date = parseISO(d)
    if (isValid(date)) return format(date, "MMM dd, yyyy HH:mm")
  } catch (_) {}
  return d
}

const LoadingBanner = ({ msg }: { msg: string }) => (
  <div className="flex items-center space-x-2 p-2 sm:p-4 bg-blue-100 border-2 sm:border-4 border-black">
    <LoaderCircle className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600" />
    <span className="font-bold text-xs sm:text-sm">{msg}</span>
  </div>
)

/* ════════════════  COMPONENT  ════════════════ */
const NftAnalytics: React.FC<NftAnalyticsProps> = ({
  blockchain,
  contractAddress,
  tokenId,
  timeRange,
  apiKey,
}) => {
  /* ── data state ── */
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [washtrade, setWashtrade] = useState<WashtradeData | null>(null)
  const [owner, setOwner] = useState<OwnerData | null>(null)
  const [scores, setScores] = useState<ScoresData | null>(null)
  const [chartData, setChartData] = useState<
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

  /* ════════════════  AI Chat state  ════════════════ */
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isOpen: false,
    isMinimized: false,
    isStreaming: false,
  })
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const isAllLoaded = () => !!(analytics && washtrade && owner && scores)

  const prepareContextData = () =>
    JSON.stringify(
      {
        blockchain,
        contractAddress,
        tokenId,
        timeRange,
        analytics,
        washtrade,
        owner,
        scores,
        chartData,
      },
      null,
      2,
    )

  /* ════════════════  AI helpers  ════════════════ */
  const sendToOpenAI = async (userMsg: string, ctx: string) => {
    if (!openaiApiKey) throw new Error("OpenAI key missing")

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        temperature: 0.7,
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content:
              `You are an AI assistant analysing detailed NFT analytics, washtrade, owner, and score data.\n` +
              `Context Data:\n${ctx}\n\n` +
            `Please provide helpful, accurate responses based on this wallet data. When users ask about specific tokens, NFTs, scores, or metrics, reference the actual data provided. Format your responses clearly and highlight important information using **bold text** for emphasis.` +
              `When useful, respond with **one JSON spec wrapped in a \`\`\`chart fence**:\n` +
              `\`\`\`chart\n{\n  "type":"<bar|pie|line>",\n  "chartData":[{"name":"label","value":123},…],\n  "config":{"xKey":"name","yKey":"value","valueKey":"value"}\n}\n\`\`\`\n` +
              `Return **exactly one** such fenced block if (and only if) a chart would benefit the user.`,
          },
          { role: "user", content: userMsg },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`)
    return res
  }

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInputRef.current?.value.trim() ?? ''
    if (!text || chatState.isStreaming) return

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() }
    setChatState((p) => ({ ...p, messages: [...p.messages, userMsg], isStreaming: true }))
    if (chatInputRef.current) chatInputRef.current.value = ''

    try {
      const ctx = prepareContextData()
      const response = await sendToOpenAI(userMsg.content, ctx)

      const assistantMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", content: "", timestamp: new Date() }
      setChatState((p) => ({ ...p, messages: [...p.messages, assistantMsg] }))

      const reader = response.body?.getReader()
      const dec = new TextDecoder()

      if (reader)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = dec.decode(value)
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") continue
            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.delta?.content || ""
              if (content)
                setChatState((p) => {
                  const msgs = [...p.messages]
                  msgs[msgs.length - 1].content += content
                  return { ...p, messages: msgs }
                })
            } catch (_) {}
          }
        }
    } catch (err: any) {
      setChatState((p) => ({
        ...p,
        messages: [
          ...p.messages,
          { id: (Date.now() + 2).toString(), role: "assistant", content: `Error: ${err.message}`, timestamp: new Date() },
        ],
      }))
    } finally {
      setChatState((p) => ({ ...p, isStreaming: false }))
    }
  }

  useEffect(() => {
    if (chatContainerRef.current && chatState.isOpen && !chatState.isMinimized)
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [chatState.messages, chatState.isOpen, chatState.isMinimized])

  useEffect(() => {
    if (chatState.isOpen && !chatState.isMinimized && chatInputRef.current) chatInputRef.current.focus()
  }, [chatState.isOpen, chatState.isMinimized])

  /* ════════════════  AI UI helpers  ════════════════ */
  const ChartRenderer = ({ data }: { data: any }) => {
    const { type, chartData, config } = data
    if (!Array.isArray(chartData)) return null
    const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#6366f1"]
    const chart =
      type === "bar" ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config?.xKey || "name"} fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip
              contentStyle={{ border: "4px solid black", backgroundColor: "white", fontWeight: "bold", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
            />
            <Bar dataKey={config?.yKey || "value"} fill="#6366f1" barSize={28} stroke="#000" strokeWidth={2} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : type === "pie" ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey={config?.valueKey || "value"}
              stroke="#000"
              strokeWidth={2}
              label={({ name, value }) => `${name}: ${value}`}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ border: "4px solid black", backgroundColor: "white", fontWeight: "bold", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }} />
          </PieChart>
        </ResponsiveContainer>
      ) : type === "line" ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config?.xKey || "name"} fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip contentStyle={{ border: "4px solid black", backgroundColor: "white", fontWeight: "bold", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }} />
            <Line type="monotone" dataKey={config?.yKey || "value"} stroke="#6366f1" strokeWidth={3} dot={{ fill: "#6366f1", stroke: "#000", strokeWidth: 2, r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-center">Unsupported chart type: {type}</p>
      )
    return (
      <div className="w-full h-48 bg-gray-50 border-4 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        {chart}
      </div>
    )
  }

  const formatMsg = (t: string) =>
    t.split("\n").map((l, i) => {
      const bold = l.replace(/\*\*(.*?)\*\*/g, '<strong class="font-black bg-yellow-200 px-1 border-2 border-black">$1</strong>')
      const code = bold.replace(/`(.*?)`/g, '<code class="bg-gray-200 px-2 py-1 border-2 border-black font-mono text-xs">$1</code>')
      return <div key={i} dangerouslySetInnerHTML={{ __html: code }} />
    })

  const MessageContent = ({ content }: { content: string }) => {
    const match = content.match(/```chart\n([\s\S]*?)\n```/)
    if (match) {
      try {
        const data = JSON.parse(match[1])
        const rest = content.replace(/```chart\n[\s\S]*?\n```/, "").trim()
        return (
          <div className="space-y-3">
            {rest && <div className="formatted-text">{formatMsg(rest)}</div>}
            <ChartRenderer data={data} />
          </div>
        )
      } catch (_) {}
    }
    return <div className="formatted-text">{formatMsg(content)}</div>
  }

  const AICopilotChatbot = () => (
    <div className="relative">
      {!chatState.isOpen && (
        <Button
          onClick={() => setChatState((p) => ({ ...p, isOpen: true }))}
          disabled={!isAllLoaded()}
          className={`w-full font-bold py-3 px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 ${
            isAllLoaded() ? "bg-gradient-to-r from-purple-200 to-pink-200 hover:from-purple-300 hover:to-pink-300 text-black" : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          <Bot className="h-5 w-5" />
          Ask AI Copilot…
        </Button>
      )}

      {chatState.isOpen && (
        <Card className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-4">
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-200 to-pink-200 border-b-4 border-black">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-black text-sm">AI Copilot</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setChatState((p) => ({ ...p, isMinimized: !p.isMinimized }))} size="sm" variant="ghost" className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {chatState.isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button onClick={() => setChatState((p) => ({ ...p, isOpen: false, messages: [] }))} size="sm" variant="ghost" className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!chatState.isMinimized && (
            <>
              {/* Key input */}
              {!openaiApiKey && (
                <div className="p-3 bg-yellow-100 border-b-4 border-black">
                  <label className="text-xs font-bold text-gray-700">OpenAI API Key Required:</label>
                  <input type="password" className="mt-2 w-full text-xs p-2 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" placeholder="Enter your OpenAI API key" onChange={(e) => setOpenaiApiKey(e.target.value)} />
                  <p className="text-xs text-gray-600 font-bold mt-1">Key stays local — never leaves your browser.</p>
                </div>
              )}

              {/* Messages */}
              <div ref={chatContainerRef} className="h-64 overflow-y-auto p-3 space-y-3 bg-gray-50 border-b-4 border-black">
                {chatState.messages.length === 0 && (
                  <div className="text-center text-gray-500 text-sm p-4 border-4 border-gray-300 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="font-black">Ask me anything about this NFT!</p>
                    <p className="text-xs mt-1 font-bold">Try: "Show price trend chart"</p>
                  </div>
                )}

                {chatState.messages.map((m) => {
                  const hasChart = m.content.includes("```chart")
                  const w = hasChart ? "w-full max-w-none" : "max-w-xs lg:max-w-md"
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`${w} px-4 py-3 border-4 border-black font-bold text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${m.role === "user" ? "bg-blue-200 text-blue-900" : "bg-white text-gray-800"}`}>
                        <MessageContent content={m.content} />
                        <div className="text-xs opacity-70 mt-2 font-bold">{m.timestamp.toLocaleTimeString()}</div>
                      </div>
                    </div>
                  )
                })}

                {chatState.isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-white border-4 border-black px-4 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <div className="flex items-center space-x-1">
                        <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black" />
                        <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black" style={{ animationDelay: "0.1s" }} />
                        <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black" style={{ animationDelay: "0.2s" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              {openaiApiKey && (
                <form onSubmit={handleChatSubmit} className="p-3 bg-white">
                  <div className="flex flex-col md:flex-row gap-2">
                    <input ref={chatInputRef}  placeholder="Ask about analytics…" className="flex-grow text-sm p-3 bg-white border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none" disabled={chatState.isStreaming} />
                    <Button type="submit" disabled={chatState.isStreaming} className="flex-shrink-0 md:w-14 bg-purple-200 hover:bg-purple-300 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 grid place-content-center">
                      <Send className="h-5 w-5" />
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )

  /* ════════════════  progress state helpers  ════════════════ */
  const setLoad = (k: keyof LoadingState, v: boolean) => setLoadingStates((p) => ({ ...p, [k]: v }))
  const initSeq = () =>
    setSeqTasks([
      { name: "analytics", status: "pending", message: "Waiting…" },
      { name: "washtrade", status: "pending", message: "Waiting…" },
      { name: "owner", status: "pending", message: "Waiting…" },
      { name: "scores", status: "pending", message: "Waiting…" },
    ])
  const updSeq = (name: SequentialTaskStatus["name"], status: SequentialTaskStatus["status"], msg: string) =>
    setSeqTasks((p) => p.map((t) => (t.name === name ? { ...t, status, message: msg } : t)))

  /* ════════════════  FETCHERS (same as original)  ════════════════ */
  const fetchAnalytics = useCallback(async () => {
    if (!apiKey) return false
    const params = { blockchain, contract_address: [contractAddress], token_id: [tokenId], time_range: timeRange, sort_by: "sales" }
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
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/analytics", { params, headers: { "x-api-key": apiKey } })
      const data: AnalyticsData = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      const arr = <T extends string | number = string | number>(v: unknown): T[] => (Array.isArray(v) ? v : parseBraceArray<T>(String(v)))
      const trend: AnalyticsData = { ...data, block_dates: arr<string>(data.block_dates), performance_trend: arr<number>(data.performance_trend), market_activity_trend: arr<number>(data.market_activity_trend), price_trend: arr<number>(data.price_trend), volume_trend: arr<number>(data.volume_trend) }
      setAnalytics(trend)
      setCached(key, trend, CACHE_DURATION.ANALYTICS)
      updSeq("analytics", "success", "Analytics loaded")
      if (trend.block_dates.length)
        setChartData(trend.block_dates.map((d, i) => ({ timestamp: safeFormatDate(d), performance: trend.performance_trend[i], market_activity: trend.market_activity_trend[i], price: trend.price_trend[i], volume: trend.volume_trend[i] })))
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

  const fetchWashtrade = useCallback(async () => {
    if (!apiKey) return false
    const params = { blockchain, contract_address: [contractAddress], token_id: [tokenId], time_range: timeRange, sort_by: "washtrade_volume" }
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
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/washtrade", { params, headers: { "x-api-key": apiKey } })
      const d = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setWashtrade(d)
      setCached(key, d, CACHE_DURATION.WASHTRADE)
      updSeq("washtrade", "success", "Washtrade loaded")
      return true
    } catch (e) {
      console.error("wash error", e)
      updSeq("washtrade", "error", "Failed washtrade")
      setError("Failed to fetch wash-trade data")
      return false
    } finally {
      setLoad("washtrade", false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange])

  const fetchOwner = useCallback(async () => {
    if (!apiKey) return false
    const params = { blockchain, contract_address: contractAddress, token_id: tokenId, time_range: "all", sort_by: "acquired_date" }
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
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/owner", { params, headers: { "x-api-key": apiKey } })
      const d = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setOwner(d)
      setCached(key, d, CACHE_DURATION.OWNER)
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
  }, [apiKey, blockchain, contractAddress, tokenId])

  const fetchScores = useCallback(async () => {
    if (!apiKey) return false
    const params = { blockchain, contract_address: [contractAddress], token_id: [tokenId], time_range: timeRange, sort_by: "price_ceiling" }
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
      const res = await axios.get("https://api.unleashnfts.com/api/v2/nft/scores", { params, headers: { "x-api-key": apiKey } })
      const d = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setScores(d)
      setCached(key, d, CACHE_DURATION.SCORES)
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

  /* ════════════════  DEBOUNCE trigger  ════════════════ */
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

  /* ════════════════  UI helpers  ════════════════ */
  const SequentialProgress = () => (
    <div className="bg-blue-100 border-2 sm:border-4 border-black p-2 sm:p-3 mb-4">
      {seqTasks.map((t) => (
        <div key={t.name} className="flex items-center space-x-2 bg-white p-1 sm:p-2 border border-black sm:border-2 mb-1">
          {t.status === "pending" && <div className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-gray-400 rounded-full" />}
          {t.status === "loading" && <LoaderCircle className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-blue-600" />}
          {t.status === "success" && <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />}
          {t.status === "error" && <XCircle className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />}
          <span className="text-xs font-bold capitalize">{t.name}</span>
          <span className="text-[10px] sm:text-xs flex-grow truncate">{t.message}</span>
        </div>
      ))}
    </div>
  )

  /* ════════════════  RENDER  ════════════════ */
  if (error)
    return <div className="p-4 bg-red-100 border-4 border-black font-bold text-sm">{error}</div>

  if (!analytics && Object.values(loadingStates).some(Boolean)) return <LoadingBanner msg="Loading analytics…" />

  if (!analytics)
    return (
      <div className="p-4 bg-yellow-100 border-4 border-black font-bold text-sm">
        No analytics data available.
      </div>
    )

  return (
    <Fragment>
      {/* AI Copilot */}
      <AICopilotChatbot />

      <Separator className="bg-black my-4" />

      {(isSeqLoading || seqTasks.length > 0) && <SequentialProgress />}
      {Object.values(loadingStates).some(Boolean) && (
        <div className="bg-blue-50 border-4 border-black p-2 mb-4">
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
