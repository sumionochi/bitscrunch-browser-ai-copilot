"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import axios from "axios"
import { format } from "date-fns"
import {
  LoaderCircle,
  RefreshCw,
  Send,
  Bot,
  MessageCircle,
  X,
  Minimize2,
  Maximize2,
} from "lucide-react"

/* ───── UI KIT ───── */
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

/* ───── Recharts ───── */
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

/* ──────────────────────────   AI-Copilot Chat types   ────────────────────────── */
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

/* ──────────────────────────   Component   ────────────────────────── */
const NftTransaction: React.FC<NftTransactionProps> = ({
  blockchain,
  contractAddress,
  tokenId,
  timeRange,
  apiKey,
}) => {
  /* ────── Transaction state ────── */
  const [transactions, setTransactions] = useState<NftTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ────── Cache & debounce ────── */
  const cacheRef = useRef<Record<string, CacheData>>({})
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const keyOf = (p: object) => `transactions_${JSON.stringify(p)}`
  const getCached = (k: string) =>
    cacheRef.current[k] && Date.now() < cacheRef.current[k].timestamp + cacheRef.current[k].expiresIn
      ? cacheRef.current[k].data
      : null
  const setCached = (k: string, d: any) =>
    (cacheRef.current[k] = { data: d, timestamp: Date.now(), expiresIn: CACHE_DURATION.TRANSACTIONS })
  const purge = (k: string) => delete cacheRef.current[k]

  /* ────── AI-Copilot state ────── */
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isOpen: false,
    isMinimized: false,
    isStreaming: false,
  })
  const chatInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [openaiApiKey, setOpenaiApiKey] = useState("")

  /* ────── Helpers for AI gating ────── */
  const isAllDataLoaded = () => !!transactions.length

  const prepareContextData = () =>
    JSON.stringify(
      {
        blockchain,
        contractAddress,
        tokenId,
        timeRange,
        transactions,
      },
      null,
      2,
    )

  /* ────── OpenAI streaming call ────── */
  const sendToOpenAI = async (userMessage: string, context: string) => {
    if (!openaiApiKey) throw new Error("OpenAI API key missing")

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        max_tokens: 1000,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `You are an AI assistant helping users analyse on-chain NFT transaction data for a single token. Context Data:\n${context}\n\n` + 
            `Please provide helpful, accurate responses based on this wallet data. When users ask about specific tokens, NFTs, scores, or metrics, reference the actual data provided. Format your responses clearly and highlight important information using **bold text** for emphasis.` +
              `When a visual would help, respond with **one JSON spec wrapped in a triple-back-tick fence labelled "chart"**:\n` +
              `\`\`\`chart\n{\n  "type":"<bar|pie|line>",\n  "chartData":[{"name":"label","value":123},…],\n  "config":{"xKey":"name","yKey":"value","valueKey":"value"}\n}\n\`\`\`\n` +
              `Return **exactly one** such fenced block if (and only if) a chart is useful. The front-end will render it automatically.`,
          },
          { role: "user", content: userMessage },
        ],
      }),
    })

    if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`)
    return response
  }

  /* ────── Chat submit ────── */
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInputRef.current?.value.trim() ?? ''
    if (!text || chatState.isStreaming) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    }
    setChatState((p) => ({ ...p, messages: [...p.messages, userMessage], isStreaming: true }))
    if (chatInputRef.current) chatInputRef.current.value = ''

    try {
      const context = prepareContextData()
      const response = await sendToOpenAI(userMessage.content, context)

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }
      setChatState((p) => ({ ...p, messages: [...p.messages, assistantMessage] }))

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content || ""
              if (content)
                setChatState((prev) => {
                  const msgs = [...prev.messages]
                  msgs[msgs.length - 1].content += content
                  return { ...prev, messages: msgs }
                })
            } catch (_) {
              /* ignore partial-JSON errors */
            }
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
            content: `Error: ${err instanceof Error ? err.message : "Failed to fetch AI response"}`,
            timestamp: new Date(),
          },
        ],
      }))
    } finally {
      setChatState((p) => ({ ...p, isStreaming: false }))
    }
  }

  /* ────── Scroll / focus effects ────── */
  useEffect(() => {
    if (chatContainerRef.current && chatState.isOpen && !chatState.isMinimized)
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [chatState.messages, chatState.isOpen, chatState.isMinimized])

  useEffect(() => {
    if (chatState.isOpen && !chatState.isMinimized && chatInputRef.current) chatInputRef.current.focus()
  }, [chatState.isOpen, chatState.isMinimized])

  /* ────── Fetcher ────── */
  const fetchTransactions = useCallback(async () => {
    if (!apiKey) return
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
      const data: NftTransaction[] = Array.isArray(res.data?.data) ? res.data.data : [res.data.data]
      setTransactions(data.filter((tx): tx is NftTransaction => tx !== null))
      setCached(cacheKey, data)
    } catch (e) {
      console.error("Error fetching transactions:", e)
      setError("Failed to fetch transaction data")
    } finally {
      setIsLoading(false)
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange])

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

  /* ────── Formatting helpers ────── */

  /* ────── Reusable chart renderer ────── */
  const ChartRenderer = ({ data }: { data: any }) => {
    const { type, chartData, config } = data
    if (!chartData || !Array.isArray(chartData)) return null

    const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#6366f1"]

    const chart = {
      bar: (
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
            <Bar
              dataKey={config?.yKey || "value"}
              fill="#6366f1"
              barSize={28}
              radius={[2, 2, 0, 0]}
              stroke="#000"
              strokeWidth={2}
            />
          </BarChart>
        </ResponsiveContainer>
      ),
      pie: (
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
      ),
      line: (
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
      ),
      default: <p className="text-center">Unsupported chart type: {type}</p>,
    } as const

    return (
      <div className="w-full h-48 bg-gray-50 border-4 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        {chart[type as keyof typeof chart] || chart.default}
      </div>
    )
  }

  /* ────── Message formatting ────── */
  const MessageContent = ({ content }: { content: string }) => {
    const chartMatch = content.match(/```chart\n([\s\S]*?)\n```/)
    if (chartMatch) {
      try {
        const data = JSON.parse(chartMatch[1])
        const remaining = content.replace(/```chart\n[\s\S]*?\n```/, "").trim()
        return (
          <div className="space-y-3">
            {remaining && <div className="formatted-text">{formatMessageText(remaining)}</div>}
            <ChartRenderer data={data} />
          </div>
        )
      } catch {
        /* fall through */
      }
    }
    return <div className="formatted-text">{formatMessageText(content)}</div>
  }

  const formatMessageText = (text: string) =>
    text.split("\n").map((line, i) => {
      let formatted = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black bg-yellow-200 px-1 border-2 border-black">$1</strong>')
        .replace(/`(.*?)`/g, '<code class="bg-gray-200 px-2 py-1 border-2 border-black font-mono text-xs">$1</code>')
      return <div key={i} dangerouslySetInnerHTML={{ __html: formatted }} />
    })

  /* ────── Chat UI wrapper ────── */
  const AICopilotChatbot = () => (
    <div className="relative">
      {/* Toggle btn */}
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

      {/* Chat panel */}
      {chatState.isOpen && (
        <Card className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-4">
          {/* Header */}
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
              {/* API key prompt */}
              {!openaiApiKey && (
                <div className="p-3 bg-yellow-100 border-b-4 border-black">
                  <label className="text-xs font-bold text-gray-700">OpenAI API Key Required:</label>
                  <input
                    type="password"
                    placeholder="Enter your OpenAI API key"
                    className="mt-2 w-full text-xs p-2 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                  />
                  <p className="text-xs text-gray-600 font-bold mt-1">Key is stored locally, never sent to our server.</p>
                </div>
              )}

              {/* Messages */}
              <div ref={chatContainerRef} className="h-64 overflow-y-auto p-3 space-y-3 bg-gray-50 border-b-4 border-black">
                {chatState.messages.length === 0 && (
                  <div className="text-center text-gray-500 text-sm p-4 border-4 border-gray-300 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="font-black">Ask me anything about this NFT!</p>
                    <p className="text-xs mt-1 font-bold">Try: "Show volume chart of last 30d"</p>
                  </div>
                )}

                {chatState.messages.map((m) => {
                  const hasChart = m.content.includes("```chart")
                  const bubbleWidth = hasChart ? "w-full max-w-none" : "max-w-xs lg:max-w-md"
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`${bubbleWidth} px-4 py-3 border-4 border-black font-bold text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
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
                        ></div>
                        <div
                          className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              {openaiApiKey && (
                <form onSubmit={handleChatSubmit} className="p-3 bg-white">
                  <div className="flex flex-col md:flex-row gap-2">
                    <input
                      ref={chatInputRef}
                      type="text"
                      
                      placeholder="Ask about these transactions…"
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

  /* ────── Banner components ────── */
  const Banner = ({ msg }: { msg: string }) => (
    <div className="flex items-center space-x-2 p-2 sm:p-4 bg-blue-100 border-2 sm:border-4 border-black">
      <LoaderCircle className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600 flex-shrink-0" />
      <span className="font-bold text-xs sm:text-sm">{msg}</span>
    </div>
  )
  const RetryBtn = () => (
    <button
      onClick={retry}
      className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 font-bold text-xs sm:text-sm bg-red-200 hover:bg-red-300 disabled:bg-gray-200 disabled:cursor-not-allowed border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center space-x-1 sm:space-x-2"
    >
      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />
      <span>Retry</span>
    </button>
  )

  /* ────── Render ────── */
  if (isLoading) return <Banner msg="Fetching transactions…" />

  if (error)
    return (
      <div className="space-y-2">
        <div className="p-2 sm:p-4 bg-red-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
          {error}
        </div>
        <RetryBtn />
      </div>
    )

  if (!transactions.length)
    return (
      <div className="space-y-2">
        <div className="p-2 sm:p-4 bg-yellow-100 border-2 sm:border-4 border-black font-bold text-xs sm:text-base">
          No transactions found for this NFT.
        </div>
        <RetryBtn />
      </div>
    )

  return (
    <div className="space-y-4">
      {/* AI Chat */}
      <AICopilotChatbot />

      <Separator className="bg-black" />

      {/* Transactions table / cards */}
      <div className="w-full">
        {/* Mobile card view */}
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

        {/* Desktop table */}
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
                    <span className="sm:hidden">{format(new Date(tx.timestamp), "MMM dd")}</span>
                    <span className="hidden sm:block">{format(new Date(tx.timestamp), "MMM dd, yyyy HH:mm")}</span>
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
    </div>
  )
}

export default NftTransaction
