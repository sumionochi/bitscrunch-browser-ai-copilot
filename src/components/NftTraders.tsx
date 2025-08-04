"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState, Fragment } from "react"
import axios from "axios"
import { Card, CardContent } from "./ui/card"
import { format } from "date-fns"
import TraderChart from "./TraderChart"
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
  TrendingUp,
  TrendingDown,
} from "lucide-react"

import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
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
  <div className="flex items-center space-x-2 p-2 sm:p-4 bg-blue-100 border-2 sm:border-4 border-black">
    <LoaderCircle className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600 flex-shrink-0" />
    <span className="font-bold text-xs sm:text-sm">{msg}</span>
  </div>
)

/* ════════════════  COMPONENT  ════════════════ */
const NftTraders: React.FC<NftTradersProps> = ({
  blockchain,
  contractAddress,
  tokenId,
  timeRange,
  apiKey,
}) => {
  /* ── data state ── */
  const [metrics, setMetrics] = useState<TraderMetrics | null>(null)
  const [chartData, setChartData] = useState<{ date: string; traders: number; buyers: number; sellers: number }[]>([])
  const [sortBy, setSortBy] = useState("traders")
  const [showChart, setShowChart] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingStates, setLoadingStates] = useState<LoadingState>({ metrics: false, history: false })
  const [seqTasks, setSeqTasks] = useState<SequentialTaskStatus[]>([])
  const [isSeqLoading, setIsSeqLoading] = useState(false)

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

  /* ── AI Chat state ── */
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isOpen: false,
    isMinimized: false,
    isStreaming: false,
  })
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const chatInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const isAllDataLoaded = () => !!metrics

  const prepareContextData = () =>
    JSON.stringify(
      {
        blockchain,
        contractAddress,
        tokenId,
        timeRange,
        metrics,
        chartData,
      },
      null,
      2,
    )

  /* ── AI streaming fetch ── */
  const sendToOpenAI = async (userMsg: string, ctx: string) => {
    if (!openaiApiKey) throw new Error("OpenAI API key missing")
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        max_tokens: 1000,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              `You are an AI assistant that analyses NFT trader metrics. Context Data:\n${ctx}\n\n` +
              + 
            `Please provide helpful, accurate responses based on this wallet data. When users ask about specific tokens, NFTs, scores, or metrics, reference the actual data provided. Format your responses clearly and highlight important information using **bold text** for emphasis.` +
              `When a visual would help, respond with **one JSON spec wrapped in a triple-back-tick fence labelled "chart"**:\n` +
              `\`\`\`chart\n{\n  "type":"<bar|pie|line>",\n  "chartData":[{"name":"label","value":123},…],\n  "config":{"xKey":"name","yKey":"value","valueKey":"value"}\n}\n\`\`\`\n` +
              `Return **exactly one** such fenced block if (and only if) a chart is appropriate.`,
          },
          { role: "user", content: userMsg },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`)
    return res
  }

  /* ── chat submit ── */
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInputRef.current?.value.trim() ?? ''
    if (!text || chatState.isStreaming) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    }
    setChatState((p) => ({ ...p, messages: [...p.messages, userMsg], isStreaming: true }))
    if (chatInputRef.current) chatInputRef.current.value = ''

    try {
      const ctx = prepareContextData()
      const response = await sendToOpenAI(userMsg.content, ctx)
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }
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
          {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "AI request failed"}`,
            timestamp: new Date(),
          },
        ],
      }))
    } finally {
      setChatState((p) => ({ ...p, isStreaming: false }))
    }
  }

  /* ── chat helpers ── */
  useEffect(() => {
    if (chatContainerRef.current && chatState.isOpen && !chatState.isMinimized)
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [chatState.messages, chatState.isOpen, chatState.isMinimized])

  useEffect(() => {
    if (chatState.isOpen && !chatState.isMinimized && chatInputRef.current) chatInputRef.current.focus()
  }, [chatState.isOpen, chatState.isMinimized])

  const getChangeColor = (c: number | null) => {
    if (c === null) return "text-gray-500"
    return c >= 0 ? "text-green-600" : "text-red-600"
  }
  const getChangeIcon = (c: number | null) => {
    if (c === null) return null
    return c >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />
  }

  /* ── chart renderer ── */
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
              contentStyle={{
                border: "4px solid black",
                backgroundColor: "white",
                fontWeight: "bold",
                boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
              }}
            />
            <Bar dataKey={config?.yKey || "value"} fill="#6366f1" radius={[2, 2, 0, 0]} stroke="#000" strokeWidth={2} />
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
            <Tooltip
              contentStyle={{
                border: "4px solid black",
                backgroundColor: "white",
                fontWeight: "bold",
                boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : type === "line" ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config?.xKey || "name"} fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip
              contentStyle={{
                border: "4px solid black",
                backgroundColor: "white",
                fontWeight: "bold",
                boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
              }}
            />
            <Line
              type="monotone"
              dataKey={config?.yKey || "value"}
              stroke="#6366f1"
              strokeWidth={3}
              dot={{ fill: "#6366f1", stroke: "#000", strokeWidth: 2, r: 4 }}
            />
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

  const formatMessageText = (t: string) =>
    t.split("\n").map((l, i) => {
      const bold = l.replace(
        /\*\*(.*?)\*\*/g,
        '<strong class="font-black bg-yellow-200 px-1 border-2 border-black">$1</strong>',
      )
      const code = bold.replace(
        /`(.*?)`/g,
        '<code class="bg-gray-200 px-2 py-1 border-2 border-black font-mono text-xs">$1</code>',
      )
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
            {rest && <div className="formatted-text">{formatMessageText(rest)}</div>}
            <ChartRenderer data={data} />
          </div>
        )
      } catch (_) {}
    }
    return <div className="formatted-text">{formatMessageText(content)}</div>
  }

  const AICopilotChatbot = () => (
    <div className="relative">
      {!chatState.isOpen && (
        <Button
          onClick={() => setChatState((p) => ({ ...p, isOpen: true }))}
          disabled={!isAllDataLoaded()}
          className={`w-full font-bold py-3 px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 ${
            isAllDataLoaded()
              ? "bg-gradient-to-r from-purple-200 to-pink-200 hover:from-purple-300 hover:to-pink-300 text-black"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          <Bot className="h-5 w-5" />
          Ask AI Copilot…
        </Button>
      )}

      {chatState.isOpen && (
        <Card className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-4">
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-200 to-pink-200 border-b-4 border-black">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-black text-sm">AI Copilot</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setChatState((p) => ({ ...p, isMinimized: !p.isMinimized }))}
                size="sm"
                variant="ghost"
                className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                {chatState.isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button
                onClick={() => setChatState((p) => ({ ...p, isOpen: false, messages: [] }))}
                size="sm"
                variant="ghost"
                className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!chatState.isMinimized && (
            <>
              {!openaiApiKey && (
                <div className="p-3 bg-yellow-100 border-b-4 border-black">
                  <label className="text-xs font-bold text-gray-700">OpenAI API Key Required:</label>
                  <input
                    type="password"
                    placeholder="Enter your OpenAI API key"
                    className="mt-2 w-full text-xs p-2 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                  />
                  <p className="text-xs text-gray-600 font-bold mt-1">Key stays local, never leaves your browser.</p>
                </div>
              )}

              <div ref={chatContainerRef} className="h-64 overflow-y-auto p-3 space-y-3 bg-gray-50 border-b-4 border-black">
                {chatState.messages.length === 0 && (
                  <div className="text-center text-gray-500 text-sm p-4 border-4 border-gray-300 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="font-black">Ask me anything about these traders!</p>
                    <p className="text-xs mt-1 font-bold">Try: "Chart buyers vs sellers"</p>
                  </div>
                )}

                {chatState.messages.map((m) => {
                  const hasChart = m.content.includes("```chart")
                  const w = hasChart ? "w-full max-w-none" : "max-w-xs lg:max-w-md"
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`${w} px-4 py-3 border-4 border-black font-bold text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                          m.role === "user" ? "bg-blue-200 text-blue-900" : "bg-white text-gray-800"
                        }`}
                      >
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
                        <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black"></div>
                        <div
                          className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black"
                          style={{ animationDelay: "0.1s" }}
                        />
                        <div
                          className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black"
                          style={{ animationDelay: "0.2s" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {openaiApiKey && (
                <form onSubmit={handleChatSubmit} className="p-3 bg-white">
                  <div className="flex flex-col md:flex-row gap-2">
                    <input
                      ref={chatInputRef}
                      type="text"
                      
                      placeholder="Ask about trader metrics…"
                      className="flex-grow text-sm p-3 bg-white border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none"
                      disabled={chatState.isStreaming}
                    />
                    <Button
                      type="submit"
                      disabled={chatState.isStreaming}
                      className="flex-shrink-0 md:w-14 bg-purple-200 hover:bg-purple-300 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 grid place-content-center"
                    >
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

  /* ── seq helpers ── */
  const initSeq = () =>
    setSeqTasks([
      { name: "metrics", status: "pending", message: "Waiting…" },
      { name: "history", status: "pending", message: "Waiting…" },
    ])
  const updSeq = (name: "metrics" | "history", status: SequentialTaskStatus["status"], msg: string) =>
    setSeqTasks((p) => p.map((t) => (t.name === name ? { ...t, status, message: msg } : t)))
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
      const d = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data
      setMetrics(d)
      setCached(key, d, CACHE_DURATION.METRICS)
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

  /* ── debounce trigger ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(sequentialFetch, 300)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [blockchain, contractAddress, tokenId, timeRange, sortBy, sequentialFetch])

  /* ════════════════  UI  ════════════════ */
  const SequentialProgress = () => (
    <div className="bg-blue-100 border-2 sm:border-4 border-black p-2 sm:p-3 mb-2 sm:mb-4">
      {seqTasks.map((t) => (
        <div
          key={t.name}
          className="flex items-center space-x-2 bg-white p-1 sm:p-2 border border-black sm:border-2 mb-1"
        >
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

  if (error)
    return (
      <div className="p-2 sm:p-4 bg-red-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
        {error}
      </div>
    )

  if (!metrics && (loadingStates.metrics || loadingStates.history)) return <LoadingBanner msg="Loading trader data…" />

  return (
    <Fragment>
      {/* AI Copilot */}
      <AICopilotChatbot />

      <Separator className="bg-black my-4" />

      {(isSeqLoading || seqTasks.length > 0) && <SequentialProgress />}
      {(loadingStates.metrics || loadingStates.history) && (
        <div className="bg-blue-50 border-2 sm:border-4 border-black p-2 sm:p-4 mb-4">
          {loadingStates.metrics && <LoadingBanner msg="Updating metrics…" />}
          {loadingStates.history && <LoadingBanner msg="Updating history…" />}
        </div>
      )}

      {metrics && (
        <div className="space-y-4">
          {/* controls */}
          <div className="bg-white p-4 border-2 sm:border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full sm:flex-1 h-10 sm:h-12 text-xs sm:text-sm bg-white font-black uppercase border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value} className="font-bold">
                    {o.label}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => setShowChart(!showChart)}
                className={`w-full sm:w-auto px-6 py-2 font-bold text-xs sm:text-sm border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                  showChart ? "bg-orange-200" : "bg-blue-200"
                }`}
              >
                {showChart ? "Hide Chart" : "Show Chart"}
              </Button>
            </div>
            {showChart && chartData.length > 0 && (
              <div className="border-2 sm:border-4 border-black p-2 sm:p-4">
                <TraderChart data={chartData} />
              </div>
            )}
          </div>

          {/* metrics */}
          <Card className="bg-white border-2 sm:border-4 p-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* traders */}
                <div className="space-y-2 bg-blue-100 p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-lg">Total Traders</h3>
                  <p className="text-3xl font-black">{metrics.traders}</p>
                  <p className={`text-sm font-bold ${getChangeColor(metrics.traders_change)}`}>
                    {getChangeIcon(metrics.traders_change)}
                    {metrics.traders_change !== null && ` ${(metrics.traders_change * 100).toFixed(2)}%`}
                  </p>
                </div>

                {/* buyers */}
                <div className="space-y-2 bg-green-100 p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-lg">Buyers</h3>
                  <p className="text-3xl font-black">{metrics.traders_buyers}</p>
                  <p className={`text-sm font-bold ${getChangeColor(metrics.traders_buyers_change)}`}>
                    {getChangeIcon(metrics.traders_buyers_change)}
                    {metrics.traders_buyers_change !== null && ` ${(metrics.traders_buyers_change * 100).toFixed(2)}%`}
                  </p>
                </div>

                {/* sellers */}
                <div className="space-y-2 bg-red-100 p-4 border-2 sm:border-4 border-black">
                  <h3 className="font-black text-lg">Sellers</h3>
                  <p className="text-3xl font-black">{metrics.traders_sellers}</p>
                  <p className={`text-sm font-bold ${getChangeColor(metrics.traders_sellers_change)}`}>
                    {getChangeIcon(metrics.traders_sellers_change)}
                    {metrics.traders_sellers_change !== null && ` ${(metrics.traders_sellers_change * 100).toFixed(2)}%`}
                  </p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-yellow-100 border-2 sm:border-4 border-black">
                <p className="text-sm font-bold">Last Updated: {new Date(metrics.updated_at).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Fragment>
  )
}

export default NftTraders
