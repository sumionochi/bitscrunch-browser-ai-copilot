"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import {
  Bot,
  MessageCircle,
  Send,
  X,
  Minimize2,
  Maximize2,
  TrendingUp,
  TrendingDown,
} from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent } from "./ui/card"
import { Button } from "./ui/button"

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
import { Separator } from "@radix-ui/react-separator"

/* ════════════════  Props  ════════════════ */
interface NftCollectionPriceEstimationProps {
  data?:
    | {
        address: string
        chain_id: number
        collection_drivers: string
        collection_name: string
        nft_rarity_drivers: string
        nft_sales_drivers: string
        prediction_percentile: string
        price_estimate: number
        price_estimate_lower_bound: number
        price_estimate_upper_bound: number
        thumbnail_palette: string
        thumbnail_url: string
        token_id: string
        token_image_url: string
      }[]
    | null
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

/* ════════════════  Shared helpers (same as single NFT)  ════════════════ */
const formatMsg = (t: string) =>
  t.split("\n").map((l, i) => {
    const bold = l.replace(/\*\*(.*?)\*\*/g, '<strong class="font-black bg-yellow-200 px-1 border-2 border-black">$1</strong>')
    const code = bold.replace(/`(.*?)`/g, '<code class="bg-gray-200 px-2 py-1 border-2 border-black font-mono text-xs">$1</code>')
    return <div key={i} dangerouslySetInnerHTML={{ __html: code }} />
  })

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
          <Tooltip contentStyle={{ border: "4px solid black", backgroundColor: "white", fontWeight: "bold", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }} />
          <Bar dataKey={config?.yKey || "value"} fill="#6366f1" barSize={28} stroke="#000" strokeWidth={2} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    ) : type === "pie" ? (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" outerRadius={80} dataKey={config?.valueKey || "value"} stroke="#000" strokeWidth={2} label={({ name, value }) => `${name}: ${value}`}>
            {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
      <p className="text-center">Unsupported chart type</p>
    )
  return <div className="w-full h-48 bg-gray-50 border-4 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">{chart}</div>
}

const MessageContent = ({ content }: { content: string }) => {
  const match = content.match(/```chart\n([\s\S]*?)\n```/)
  if (match) {
    try {
      const chartData = JSON.parse(match[1])
      const rest = content.replace(/```chart\n[\s\S]*?\n```/, "").trim()
      return (
        <div className="space-y-3">
          {rest && <div className="formatted-text">{formatMsg(rest)}</div>}
          <ChartRenderer data={chartData} />
        </div>
      )
    } catch {}
  }
  return <div className="formatted-text">{formatMsg(content)}</div>
}

/* ════════════════  Component  ════════════════ */
const NftCollectionPriceCard: React.FC<NftCollectionPriceEstimationProps> = ({ data }) => {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isOpen: false,
    isMinimized: false,
    isStreaming: false,
  })
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const isReady = !!data && data.length > 0
  const prepareCtx = () => JSON.stringify({ collectionPriceData: data }, null, 2)

  /* ── OpenAI handler (same as single NFT) ── */
  const sendToOpenAI = async (u: string, ctx: string) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        temperature: 0.7,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              `You are an AI assistant analysing collection-level NFT price estimations.\nContext:\n${ctx}\n\n` +
              `Please provide helpful, accurate responses based on this wallet data. When users ask about specific tokens, NFTs, scores, or metrics, reference the actual data provided. Format your responses clearly and highlight important information using **bold text** for emphasis.` +
                `When a visual would help, respond with **one JSON spec wrapped in a triple-back-tick fence labelled "chart"**:\n` +
                `\`\`\`chart\n{\n  "type":"<bar|pie|line>",\n  "chartData":[{"name":"label","value":123},…],\n  "config":{"xKey":"name","yKey":"value","valueKey":"value"}\n}\n\`\`\`\n` +
                `Return **exactly one** such fenced block if (and only if) a chart is useful. The front-end will render it automatically.`,
          },
          { role: "user", content: u },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`)
    return res
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInputRef.current?.value.trim() ?? ''
    if (!text || chatState.isStreaming) return
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() }
    setChatState((p) => ({ ...p, messages: [...p.messages, userMsg], isStreaming: true }))
    if (chatInputRef.current) chatInputRef.current.value = ''
    try {
      const response = await sendToOpenAI(userMsg.content, prepareCtx())
      const assistantMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", content: "", timestamp: new Date() }
      setChatState((p) => ({ ...p, messages: [...p.messages, assistantMsg] }))
      const reader = response.body?.getReader()
      const dec = new TextDecoder()
      if (reader)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of dec.decode(value).split("\n")) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6)
            if (payload === "[DONE]") continue
            try {
              const json = JSON.parse(payload)
              const chunk = json.choices?.[0]?.delta?.content || ""
              if (chunk)
                setChatState((p) => {
                  const msgs = [...p.messages]
                  msgs[msgs.length - 1].content += chunk
                  return { ...p, messages: msgs }
                })
            } catch {}
          }
        }
    } catch (err: any) {
      setChatState((p) => ({
        ...p,
        messages: [...p.messages, { id: (Date.now() + 2).toString(), role: "assistant", content: `Error: ${err.message}`, timestamp: new Date() }],
      }))
    } finally {
      setChatState((p) => ({ ...p, isStreaming: false }))
    }
  }

  /* auto scroll & focus */
  useEffect(() => {
    if (chatContainerRef.current && chatState.isOpen && !chatState.isMinimized)
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [chatState.messages, chatState.isOpen, chatState.isMinimized])
  useEffect(() => {
    if (chatState.isOpen && !chatState.isMinimized && chatInputRef.current) chatInputRef.current.focus()
  }, [chatState.isOpen, chatState.isMinimized])

  /* ════════════════  Copilot UI  ════════════════ */
  const AICopilot = () => (
    <div className="relative mb-4">
      {!chatState.isOpen ? (
        <Button onClick={() => setChatState((p) => ({ ...p, isOpen: true }))} disabled={!isReady} className={`w-full font-bold py-3 px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 ${isReady ? "bg-gradient-to-r from-purple-200 to-pink-200 hover:from-purple-300 hover:to-pink-300 text-black" : "bg-gray-200 text-gray-500"}`}>
          <Bot className="h-5 w-5" />
          Ask AI Copilot…
        </Button>
      ) : (
        <Card className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          {/* header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-200 to-pink-200 border-b-4 border-black">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-black text-sm">AI Copilot</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setChatState((p) => ({ ...p, isMinimized: !p.isMinimized }))} size="sm" variant="ghost" className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {chatState.isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button onClick={() => setChatState({ messages: [], isOpen: false, isMinimized: false, isStreaming: false })} size="sm" variant="ghost" className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!chatState.isMinimized && (
            <>
              {/* key input */}
              {!openaiApiKey && (
                <div className="p-3 bg-yellow-100 border-b-4 border-black">
                  <label className="text-xs font-bold">OpenAI API Key (required)</label>
                  <input type="password" placeholder="Enter your key…" className="mt-2 w-full text-xs p-2 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" onChange={(e) => setOpenaiApiKey(e.target.value)} />
                  <p className="text-[10px] font-bold mt-1">Key never leaves your browser.</p>
                </div>
              )}

              {/* messages */}
              <div ref={chatContainerRef} className="h-64 overflow-y-auto p-3 space-y-3 bg-gray-50 border-b-4 border-black">
                {chatState.messages.length === 0 && (
                  <div className="text-center text-gray-500 text-sm p-4 border-4 border-gray-300 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="font-black">Chat about collection pricing!</p>
                    <p className="text-xs mt-1 font-bold">e.g. “Compare rarity drivers.”</p>
                  </div>
                )}
                {chatState.messages.map((m) => {
                  const hasChart = m.content.includes("```chart")
                  const cls = hasChart ? "w-full max-w-none" : "max-w-xs lg:max-w-md"
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`${cls} px-4 py-3 border-4 border-black font-bold text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${m.role === "user" ? "bg-blue-200 text-blue-900" : "bg-white text-gray-800"}`}>
                        <MessageContent content={m.content} />
                        <div className="text-xs opacity-70 mt-2 font-bold">{m.timestamp.toLocaleTimeString()}</div>
                      </div>
                    </div>
                  )
                })}
                {chatState.isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-white border-4 border-black px-4 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <div className="flex space-x-1">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black" style={{ animationDelay: `${i * 0.1}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* input */}
              {openaiApiKey && (
                <form onSubmit={handleSubmit} className="p-3 bg-white">
                  <div className="flex gap-2">
                    <input ref={chatInputRef} placeholder="Ask something…" className="flex-grow text-sm p-3 bg-white border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none" disabled={chatState.isStreaming} />
                    <Button type="submit" disabled={chatState.isStreaming} className="flex-shrink-0 bg-purple-200 hover:bg-purple-300 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 grid place-content-center">
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

  /* ════════════════  Render  ════════════════ */
  if (!isReady)
    return (
      <>
        <AICopilot />
        <Card className="bg-white border-4 border-black p-4">
          <CardContent className="flex items-center justify-center h-24">
            <p className="text-sm font-bold text-gray-500 text-center">No collection price estimation data available</p>
          </CardContent>
        </Card>
      </>
    )

  const getClr = (v: number) => (v >= 0 ? "text-green-600" : "text-red-600")
  const getIcon = (v: number) => (v >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />)

  return (
    <>
      <Separator className="bg-black" />
      <AICopilot />

      <Card className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <CardHeader className="p-4">
          <CardTitle className="text-xl font-black uppercase bg-orange-200 px-2 border-4 border-black inline-block">Collection Price Estimates</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {data!.map((item, index) => {
            const pct = Number.parseFloat(item.prediction_percentile) * 100
            return (
              <div key={index} className="bg-yellow-100 p-4 border-4 border-black space-y-4">
                {/* header row */}
                <div className="flex items-center gap-4">
                  <img src={item.token_image_url || item.thumbnail_url} alt={item.collection_name} className="w-16 h-16 object-cover border-4 border-black" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-lg truncate">{item.collection_name}</h3>
                    <p className="text-sm font-bold">Token ID #{item.token_id}</p>
                  </div>
                </div>

                {/* price row */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { l: "Lower", v: item.price_estimate_lower_bound, c: "text-blue-600" },
                    { l: "Estimate", v: item.price_estimate, c: "text-green-600" },
                    { l: "Upper", v: item.price_estimate_upper_bound, c: "text-red-600" },
                  ].map((x) => (
                    <div key={x.l}>
                      <p className="font-bold text-sm">{x.l}</p>
                      <p className={`font-black text-lg ${x.c}`}>{x.v.toFixed(4)} ETH</p>
                    </div>
                  ))}
                </div>

                {/* confidence */}
                <div>
                  <p className="font-bold text-sm mb-1">Prediction Confidence</p>
                  <div className="relative h-6 bg-gray-200 border-2 border-black">
                    <div className="absolute h-full bg-green-400 border-r-2 border-black" style={{ width: `${pct}%` }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 font-bold text-sm">{pct.toFixed(2)}%</span>
                  </div>
                </div>

                {/* drivers */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { l: "Collection Driver", v: Number.parseFloat(item.collection_drivers) },
                    { l: "Rarity Driver", v: Number.parseFloat(item.nft_rarity_drivers) },
                    { l: "Sales Driver", v: Number.parseFloat(item.nft_sales_drivers) },
                  ].map((d) => (
                    <div key={d.l}>
                      <p className="font-bold text-sm">{d.l}</p>
                      <p className={`font-black text-lg ${getClr(d.v)}`}>{getIcon(d.v)}{d.v.toFixed(4)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </>
  )
}

export default NftCollectionPriceCard
