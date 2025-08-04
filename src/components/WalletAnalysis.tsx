"use client"

import type React from "react"
import { useState, useCallback, useRef, useEffect } from "react"
import axios from "axios"
import {
  LoaderCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Coins,
  Shield,
  BarChart3,
  Users,
  Activity,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from "recharts"
import { Send, Bot, MessageCircle, X, Minimize2, Maximize2 } from "lucide-react"
import { LineChart, Line } from "recharts"

interface WalletInfo {
  address: string
  blockchain: string
}

interface CacheData {
  data: any
  timestamp: number
  expiresIn: number
}

interface SequentialTaskStatus {
  name: string
  status: "pending" | "loading" | "success" | "error"
  message: string
}

interface LoadingState {
  defiBalance: boolean
  nftBalance: boolean
  tokenBalance: boolean
  walletLabel: boolean
  nftProfile: boolean
  walletScore: boolean
  walletMetrics: boolean
  nftAnalytics: boolean
  nftScores: boolean
  nftTraders: boolean
  nftWashtrade: boolean
}

interface WalletAnalysisProps {
  apiKey: string
  tabInfo?: any
  isSidepanel?: boolean
  refreshTabInfo?: () => void
  tabLoading?: boolean
  timeRange: string
}

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }
  
interface ChatState {
messages: ChatMessage[]
isOpen: boolean
isMinimized: boolean
isStreaming: boolean
}

// Cache duration in milliseconds
const CACHE_DURATION = {
  DEFI_BALANCE: 5 * 60 * 1000, // 5 minutes
  NFT_BALANCE: 5 * 60 * 1000, // 5 minutes
  TOKEN_BALANCE: 5 * 60 * 1000, // 5 minutes
  WALLET_LABEL: 30 * 60 * 1000, // 30 minutes
  NFT_PROFILE: 10 * 60 * 1000, // 10 minutes
  WALLET_SCORE: 10 * 60 * 1000, // 10 minutes
  WALLET_METRICS: 10 * 60 * 1000, // 10 minutes
  NFT_ANALYTICS: 10 * 60 * 1000, // 10 minutes
  NFT_SCORES: 10 * 60 * 1000, // 10 minutes
  NFT_TRADERS: 10 * 60 * 1000, // 10 minutes
  NFT_WASHTRADE: 10 * 60 * 1000, // 10 minutes
}

const ITEMS_PER_PAGE = 6

// declare chrome so that typescript doesn't complain
declare var chrome: any

const WalletAnalysis: React.FC<WalletAnalysisProps> = ({
  apiKey,
  tabInfo,
  isSidepanel = false,
  refreshTabInfo,
  tabLoading = false,
  timeRange,
}) => {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSequentialLoading, setIsSequentialLoading] = useState(false)
  const [sequentialTasks, setSequentialTasks] = useState<SequentialTaskStatus[]>([])

  // Pagination states
  const [nftPage, setNftPage] = useState(1)
  const [tokenPage, setTokenPage] = useState(1)

  // Loading states for each API
  const [loadingStates, setLoadingStates] = useState<LoadingState>({
    defiBalance: false,
    nftBalance: false,
    tokenBalance: false,
    walletLabel: false,
    nftProfile: false,
    walletScore: false,
    walletMetrics: false,
    nftAnalytics: false,
    nftScores: false,
    nftTraders: false,
    nftWashtrade: false,
  })

  // API response states
  const [nftBalance, setNftBalance] = useState<any>(null)
  const [tokenBalance, setTokenBalance] = useState<any>(null)
  const [walletLabel, setWalletLabel] = useState<any>(null)
  const [walletScore, setWalletScore] = useState<any>(null)
  const [walletMetrics, setWalletMetrics] = useState<any>(null)
  const [nftAnalytics, setNftAnalytics] = useState<any>(null)
  const [nftTraders, setNftTraders] = useState<any>(null)

  // Which chain to query for wallet-label look-up
  const [labelChain, setLabelChain] = useState<string>("ethereum")
  const BLOCKCHAIN_OPTIONS = ["avalanche", "bitcoin", "binance", "ethereum", "linea", "polygon", "solana"]

  // Cache storage
  const cacheRef = useRef<{ [key: string]: CacheData }>({})

  // Extract wallet address from OpenSea URL
  const extractWalletFromUrl = (url: string): WalletInfo | null => {
    try {
      // Pattern for OpenSea wallet URLs: https://opensea.io/0x...
      const walletMatch = url.match(/opensea\.io\/([^/?]+)/)
      if (walletMatch && walletMatch[1]) {
        const address = walletMatch[1]
        if (address.startsWith("0x") && address.length === 42) {
          return {
            address: address,
            blockchain: "ethereum", // Default to ethereum, can be made configurable
          }
        }
      }
      return null
    } catch (error) {
      console.error("Error extracting wallet from URL:", error)
      return null
    }
  }

  // Cache utilities
  const getCacheKey = (endpoint: string, params: any) => {
    return `${endpoint}_${JSON.stringify(params)}`
  }

  const getCachedData = (key: string): any | null => {
    const cached = cacheRef.current[key]
    if (cached && Date.now() < cached.timestamp + cached.expiresIn) {
      return cached.data
    }
    return null
  }

  const setCachedData = (key: string, data: any, expiresIn: number) => {
    cacheRef.current[key] = {
      data,
      timestamp: Date.now(),
      expiresIn,
    }
  }

  // Update loading state
  const updateLoadingState = (key: keyof LoadingState, value: boolean) => {
    setLoadingStates((prev) => ({ ...prev, [key]: value }))
  }

  // Update sequential task status
  const updateSequentialTaskStatus = (taskName: string, status: SequentialTaskStatus["status"], message: string) => {
    setSequentialTasks((prev) => prev.map((task) => (task.name === taskName ? { ...task, status, message } : task)))
  }

  // Initialize sequential tasks
  const initializeSequentialTasks = () => {
    setSequentialTasks([
      { name: "nftBalance", status: "pending", message: "Waiting to load NFT balance..." },
      { name: "tokenBalance", status: "pending", message: "Waiting to load token balance..." },
      { name: "walletLabel", status: "pending", message: "Waiting to load wallet label..." },
      { name: "walletScore", status: "pending", message: "Waiting to load wallet score..." },
      { name: "walletMetrics", status: "pending", message: "Waiting to load wallet metrics..." },
      { name: "nftAnalytics", status: "pending", message: "Waiting to load NFT analytics..." },
      { name: "nftTraders", status: "pending", message: "Waiting to load NFT traders..." },
    ])
  }

  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isOpen: false,
    isMinimized: false,
    isStreaming: false
  })
  const chatInputRef = useRef<HTMLInputElement>(null)
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  
  // Add this helper function to check if all data is available
    const isAllDataLoaded = () => {
    return !!(nftBalance && tokenBalance && walletLabel && walletScore && walletMetrics && nftAnalytics && nftTraders)
  }
  
  // Add this function to prepare context data for OpenAI
  const prepareContextData = () => {
    const contextData = {
      walletAddress: walletInfo?.address,
      blockchain: walletInfo?.blockchain,
      nftBalance: nftBalance?.data,
      tokenBalance: tokenBalance?.data,
      walletLabel: walletLabel?.data,
      walletScore: walletScore?.data,
      walletMetrics: walletMetrics?.data,
      nftAnalytics: nftAnalytics?.data,
      nftTraders: nftTraders?.data
    }
    
    return JSON.stringify(contextData, null, 2)
  }
  
  // Add this function to send message to OpenAI
  const sendToOpenAI = async (userMessage: string, contextData: string) => {
    if (!openaiApiKey) {
      throw new Error('OpenAI API key is required')
    }
  
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant helping users analyze their crypto wallet data. You have access to comprehensive wallet analysis data including NFT balance, token balance, wallet labels, wallet score, wallet metrics, NFT analytics, and NFT traders data. 
            Context Data:
            ${contextData}
            Please provide helpful, accurate responses based on this wallet data. When users ask about specific tokens, NFTs, scores, or metrics, reference the actual data provided. Format your responses clearly and highlight important information using **bold text** for emphasis.
            
            When a visual would help, respond with **one JSON spec wrapped in a triple-back-tick fence labelled "chart"**:

            ╭─ How to pick the right **"type"**     ─╮
            │ • "bar"  → compare values across       │
            │              distinct categories       │
            │      (e.g. wallet score breakdown).    │
            │ • "pie"  → show parts of a whole       │
            │              (e.g. buy vs sell share). │
            │ • "line" → show a trend over time      │
            │              (e.g. daily volume).      │
            ╰────────────────────────────────────────╯


            \`\`\`chart
            {
              "type": "<bar|pie|line>",
              "chartData": [ { "name": "label", "value": 123 }, … ],
              "config": {
                "xKey": "name",          // optional – defaults shown
                "yKey": "value",
                "valueKey": "value"
              }
            }
            \`\`\`
            
            Return **exactly one** such fenced block if (and only if) the user asked
            for, or would clearly benefit from, a chart. The front-end will render it
            automatically.`,        },
          {
            role: 'user',
            content: userMessage
          }
        ],
        stream: true,
        max_tokens: 1000,
        temperature: 0.7
      })
    })
  
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }
  
    return response
  }
  
// Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInputRef.current?.value.trim() ?? ''
    if (!text || chatState.isStreaming) return
      
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
  
    setChatState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isStreaming: true,
    }))
    if (chatInputRef.current) chatInputRef.current.value = '';  
    try {
      const contextData = prepareContextData()
      const response = await sendToOpenAI(text, contextData)
  
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
  
      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }))
  
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
  
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
  
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
  
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
  
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content || ''
  
                if (content) {
                  setChatState((prev) => {
                    const updatedMessages = [...prev.messages]
                    const lastMessage = updatedMessages[updatedMessages.length - 1]
                    if (lastMessage.role === 'assistant') {
                      lastMessage.content += content
                    }
                    return { ...prev, messages: updatedMessages }
                  })
                }
              } catch (e) {
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response from AI'}`,
        timestamp: new Date(),
      }
  
      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        isStreaming: false,
      }))
    } finally {
      setChatState((prev) => ({ ...prev, isStreaming: false }))
    }
  }
  
  // Scroll to bottom when messages change or chat opens
  useEffect(() => {
    if (chatContainerRef.current && chatState.isOpen && !chatState.isMinimized) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatState.messages, chatState.isOpen, chatState.isMinimized])
  
  // Focus input when chat opens or unminimizes
  useEffect(() => {
    if (chatState.isOpen && !chatState.isMinimized && chatInputRef.current) {
      chatInputRef.current.focus()
    }
  }, [chatState.isOpen, chatState.isMinimized])
  
  // AI Copilot Chatbot Component
  const AICopilotChatbot = () => {
    return (
      <div className="relative">
        {/* Chat Toggle Button */}
        {!chatState.isOpen && (
          <Button
            onClick={() => setChatState((prev) => ({ ...prev, isOpen: true }))}
            disabled={!isAllDataLoaded()}
            className={`w-full font-bold py-3 px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 ${
              isAllDataLoaded()
                ? 'bg-gradient-to-r from-purple-200 to-pink-200 hover:from-purple-300 hover:to-pink-300 text-black'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Bot className="h-5 w-5" />
            {isAllDataLoaded() ? 'Ask AI Copilot...' : 'Ask AI Copilot...'}
          </Button>
        )}
  
        {/* Chat Interface */}
        {chatState.isOpen && (
          <Card className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-4">
            {/* Chat Header */}
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-200 to-pink-200 border-b-4 border-black">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                <span className="font-black text-sm">AI Copilot</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setChatState((prev) => ({ ...prev, isMinimized: !prev.isMinimized }))}
                  size="sm"
                  variant="ghost"
                  className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  {chatState.isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                </Button>
                <Button
                  onClick={() => setChatState((prev) => ({ ...prev, isOpen: false, messages: [] }))}
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
                {/* OpenAI API Key Input */}
                {!openaiApiKey && (
                  <div className="p-3 bg-yellow-100 border-b-4 border-black">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-700">OpenAI API Key Required:</label>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="Enter your OpenAI API key"
                          className="flex-1 text-xs p-2 border-4 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          onChange={(e) => setOpenaiApiKey(e.target.value)}
                        />
                      </div>
                      <p className="text-xs text-gray-600 font-bold">
                        Your API key is stored locally and never sent to our servers.
                      </p>
                    </div>
                  </div>
                )}
  
                {/* Chat Messages */}
                <div
                  ref={chatContainerRef}
                  className="h-64 overflow-y-auto p-3 space-y-3 bg-gray-50 border-b-4 border-black"
                >
                  {chatState.messages.length === 0 && (
                    <div className="text-center text-gray-500 text-sm p-4 border-4 border-gray-300 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="font-black">Ask me anything about your wallet!</p>
                      <p className="text-xs mt-1 font-bold">
                        Try: "What's my token balance?" or "Show me NFT analytics chart"
                      </p>
                    </div>
                  )}
  
                  {chatState.messages.map((message) => {
                    const hasChart = message.content.includes('```chart')
                    const bubbleWidth = hasChart ? 'w-full max-w-none' : 'max-w-xs lg:max-w-md'
  
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`${bubbleWidth} px-4 py-3 border-4 border-black font-bold text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                            message.role === 'user' ? 'bg-blue-200 text-blue-900' : 'bg-white text-gray-800'
                          }`}
                        >
                          <MessageContent content={message.content} />
                          <div className="text-xs opacity-70 mt-2 font-bold">
                            {message.timestamp.toLocaleTimeString()}
                          </div>
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
                            style={{ animationDelay: '0.1s' }}
                          ></div>
                          <div
                            className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black"
                            style={{ animationDelay: '0.2s' }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
  
                {/* Chat Input */}
                {openaiApiKey && (
                <form onSubmit={handleChatSubmit} className="p-3 bg-white">
                    {/* container */}
                    <div className="flex flex-col md:flex-row gap-2">
                    {/* input ───────────────────────────────────────────── */}
                    <input
                        type="text"
                        ref={chatInputRef}
                        
                        placeholder="Ask about your wallet data…"
                        className="
                        flex-grow min-w-0                 /* 👉 always fills the remaining space */
                        text-sm p-3 bg-white
                        border-4 border-black font-bold
                        shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                        focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                        outline-none
                        "
                        disabled={chatState.isStreaming}
                    />

                    {/* button ───────────────────────────────────────────── */}
                    <Button
                        type="submit"
                        disabled={chatState.isStreaming}
                        className="
                        flex-shrink-0               /* 👉 never stretches */
                        md:w-14 md:h-auto           /* fixed width on wide screens */
                        bg-purple-200 hover:bg-purple-300
                        border-4 border-black font-bold
                        shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                        hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                        disabled:opacity-50
                        grid place-content-center   /* keeps icon centred */
                        "
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
  }

  const MessageContent = ({ content }: { content: string }) => {
    // Check if content contains chart data
    const chartMatch = content.match(/```chart\n([\s\S]*?)\n```/)
    
    if (chartMatch) {
      try {
        const chartData = JSON.parse(chartMatch[1])
        return (
          <div className="space-y-3">
            {content.replace(/```chart\n[\s\S]*?\n```/, '').trim() && (
              <div className="formatted-text">
                {formatMessageText(content.replace(/```chart\n[\s\S]*?\n```/, '').trim())}
              </div>
            )}
            <ChartRenderer data={chartData} />
          </div>
        )
      } catch (e) {
        return <div className="formatted-text">{formatMessageText(content)}</div>
      }
    }
    
    return <div className="formatted-text">{formatMessageText(content)}</div>
  }

  const formatMessageText = (text: string) => {
    // Split by lines and process each
    return text.split('\n').map((line, index) => {
      // Handle bold text **text**
      const boldFormatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-black bg-yellow-200 px-1 border-2 border-black">$1</strong>')
      
      // Handle code blocks `code`
      const codeFormatted = boldFormatted.replace(/`(.*?)`/g, '<code class="bg-gray-200 px-2 py-1 border-2 border-black font-mono text-xs">$1</code>')
      
      return (
        <div key={index} className={index > 0 ? 'mt-2' : ''} dangerouslySetInnerHTML={{ __html: codeFormatted }} />
      )
    })
  }
  
  const ChartRenderer = ({ data }: { data: any }) => {
    const { type, chartData, config } = data
    
    if (!chartData || !Array.isArray(chartData)) return null
    
    const getChart = () => {
      switch (type) {
        case 'bar':
        return (
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={config?.xKey || 'name'} fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip
                contentStyle={{
                    border: '4px solid black',
                    backgroundColor: 'white',
                    fontWeight: 'bold',
                    boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)',
                }}
                />
                {/* ⬇️  new, thicker columns – stroke removed */}
                <Bar
                dataKey={config?.yKey || 'value'}
                fill="#6366f1"
                barSize={28}          // <- sets a sensible column width
                radius={[2, 2, 0, 0]} // <- keeps the rounded top
                />
            </BarChart>
            </ResponsiveContainer>
        )
        
        case 'pie':
          return (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  dataKey={config?.valueKey || 'value'}
                  stroke="#000"
                  strokeWidth={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={['#10b981', '#ef4444', '#f59e0b', '#6366f1'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    border: '4px solid black', 
                    backgroundColor: 'white',
                    fontWeight: 'bold',
                    boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          )
        
        case 'line':
          return (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={config?.xKey || 'name'} fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip 
                  contentStyle={{ 
                    border: '4px solid black', 
                    backgroundColor: 'white',
                    fontWeight: 'bold',
                    boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)'
                  }} 
                />
                <Line 
                  type="monotone" 
                  dataKey={config?.yKey || 'value'} 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  dot={{ fill: '#6366f1', stroke: '#000', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )
        
        default:
          return (
            <div className="flex items-center justify-center h-full text-gray-500 font-bold">
              <p>Unsupported chart type: {type}</p>
            </div>
          )
      }
    }
    
    return (
      <div className="w-full h-48 bg-gray-50 border-4 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        {getChart()}
      </div>
    )
  }

  // Individual API fetch functions (keeping the same logic but updating state)
  const fetchNftBalance = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey("nft_balance", { wallet: walletInfo.address, blockchain: walletInfo.blockchain })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setNftBalance(cached)
      updateSequentialTaskStatus("nftBalance", "success", "NFT balance loaded from cache")
      return true
    }

    updateSequentialTaskStatus("nftBalance", "loading", "Fetching NFT balance...")
    updateLoadingState("nftBalance", true)

    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/wallet/balance/nft", {
        params: {
          wallet: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: "all",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      setNftBalance(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.NFT_BALANCE)
      updateSequentialTaskStatus("nftBalance", "success", "NFT balance loaded successfully")
      return true
    } catch (err) {
      console.error("Error fetching NFT balance:", err)
      updateSequentialTaskStatus("nftBalance", "error", "Failed to fetch NFT balance")
      return false
    } finally {
      updateLoadingState("nftBalance", false)
    }
  }, [walletInfo, apiKey])

  const fetchTokenBalance = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey("token_balance", { address: walletInfo.address, blockchain: walletInfo.blockchain })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setTokenBalance(cached)
      updateSequentialTaskStatus("tokenBalance", "success", "Token balance loaded from cache")
      return true
    }

    updateSequentialTaskStatus("tokenBalance", "loading", "Fetching token balance...")
    updateLoadingState("tokenBalance", true)

    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/wallet/balance/token", {
        params: {
          address: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: "all",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      setTokenBalance(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.TOKEN_BALANCE)
      updateSequentialTaskStatus("tokenBalance", "success", "Token balance loaded successfully")
      return true
    } catch (err) {
      console.error("Error fetching token balance:", err)
      updateSequentialTaskStatus("tokenBalance", "error", "Failed to fetch token balance")
      return false
    } finally {
      updateLoadingState("tokenBalance", false)
    }
  }, [walletInfo, apiKey])

  const fetchWalletLabel = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey("wallet_label", { address: walletInfo.address, blockchain: labelChain })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setWalletLabel(cached)
      updateSequentialTaskStatus("walletLabel", "success", "Wallet label loaded from cache")
      return true
    }

    updateSequentialTaskStatus("walletLabel", "loading", "Fetching wallet label...")
    updateLoadingState("walletLabel", true)

    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/wallet/label", {
        params: {
          address: walletInfo.address,
          blockchain: labelChain,
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      setWalletLabel(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.WALLET_LABEL)
      updateSequentialTaskStatus("walletLabel", "success", "Wallet label loaded successfully")
      return true
    } catch (err) {
      console.error("Error fetching wallet label:", err)
      updateSequentialTaskStatus("walletLabel", "error", "Failed to fetch wallet label")
      return false
    } finally {
      updateLoadingState("walletLabel", false)
    }
  }, [walletInfo, apiKey, labelChain])

  const fetchWalletScore = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey("wallet_score", { wallet_address: walletInfo.address, time_range: timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setWalletScore(cached)
      updateSequentialTaskStatus("walletScore", "success", "Wallet score loaded from cache")
      return true
    }

    updateSequentialTaskStatus("walletScore", "loading", "Fetching wallet score...")
    updateLoadingState("walletScore", true)

    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/wallet/score", {
        params: {
          wallet_address: walletInfo.address,
          time_range: "all",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      setWalletScore(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.WALLET_SCORE)
      updateSequentialTaskStatus("walletScore", "success", "Wallet score loaded successfully")
      return true
    } catch (err) {
      console.error("Error fetching wallet score:", err)
      updateSequentialTaskStatus("walletScore", "error", "Failed to fetch wallet score")
      return false
    } finally {
      updateLoadingState("walletScore", false)
    }
  }, [walletInfo, apiKey, timeRange])

  const fetchWalletMetrics = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    // Check if blockchain is supported
    const supportedBlockchains = ["linea", "polygon", "ethereum", "avalanche"]
    if (!supportedBlockchains.includes(walletInfo.blockchain.toLowerCase())) {
      updateSequentialTaskStatus("walletMetrics", "error", `Unsupported blockchain: ${walletInfo.blockchain}`)
      return false
    }

    const cacheKey = getCacheKey("wallet_metrics", {
      wallet: walletInfo.address,
      blockchain: walletInfo.blockchain,
      time_range: timeRange,
    })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setWalletMetrics(cached)
      updateSequentialTaskStatus("walletMetrics", "success", "Wallet metrics loaded from cache")
      return true
    }

    updateSequentialTaskStatus("walletMetrics", "loading", "Fetching wallet metrics...")
    updateLoadingState("walletMetrics", true)

    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/wallet/metrics", {
        params: {
          blockchain: walletInfo.blockchain.toLowerCase(),
          wallet: walletInfo.address,
          time_range: "all",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      setWalletMetrics(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.WALLET_METRICS)
      updateSequentialTaskStatus("walletMetrics", "success", "Wallet metrics loaded successfully")
      return true
    } catch (err) {
      console.error("Error fetching wallet metrics:", err)
      updateSequentialTaskStatus("walletMetrics", "error", "Failed to fetch wallet metrics")
      return false
    } finally {
      updateLoadingState("walletMetrics", false)
    }
  }, [walletInfo, apiKey, timeRange])

  const fetchNftAnalytics = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey("nft_analytics", {
      wallet: walletInfo.address,
      blockchain: walletInfo.blockchain,
      time_range: timeRange,
    })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setNftAnalytics(cached)
      updateSequentialTaskStatus("nftAnalytics", "success", "NFT analytics loaded from cache")
      return true
    }

    updateSequentialTaskStatus("nftAnalytics", "loading", "Fetching NFT analytics...")
    updateLoadingState("nftAnalytics", true)

    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/nft/wallet/analytics", {
        params: {
          wallet: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: timeRange,
          sort_by: "volume",
          sort_order: "desc",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      setNftAnalytics(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.NFT_ANALYTICS)
      updateSequentialTaskStatus("nftAnalytics", "success", "NFT analytics loaded successfully")
      return true
    } catch (err) {
      console.error("Error fetching NFT analytics:", err)
      updateSequentialTaskStatus("nftAnalytics", "error", "Failed to fetch NFT analytics")
      return false
    } finally {
      updateLoadingState("nftAnalytics", false)
    }
  }, [walletInfo, apiKey, timeRange])

  const fetchNftTraders = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey("nft_traders", {
      wallet: walletInfo.address,
      blockchain: walletInfo.blockchain,
      time_range: timeRange,
    })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setNftTraders(cached)
      updateSequentialTaskStatus("nftTraders", "success", "NFT traders loaded from cache")
      return true
    }

    updateSequentialTaskStatus("nftTraders", "loading", "Fetching NFT traders...")
    updateLoadingState("nftTraders", true)

    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/nft/wallet/traders", {
        params: {
          wallet: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: timeRange,
          sort_by: "traders",
          sort_order: "desc",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      setNftTraders(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.NFT_TRADERS)
      updateSequentialTaskStatus("nftTraders", "success", "NFT traders loaded successfully")
      return true
    } catch (err) {
      console.error("Error fetching NFT traders:", err)
      updateSequentialTaskStatus("nftTraders", "error", "Failed to fetch NFT traders")
      return false
    } finally {
      updateLoadingState("nftTraders", false)
    }
  }, [walletInfo, apiKey, timeRange])

  // Sequential fetch all wallet data
  const sequentialFetchAllWalletData = useCallback(async () => {
    if (!walletInfo || !apiKey) return

    setIsSequentialLoading(true)
    initializeSequentialTasks()

    // Add delay between requests to prevent rate limiting
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    try {
      await fetchNftBalance()
      await delay(500)
      await fetchTokenBalance()
      await delay(500)
      await fetchWalletLabel()
      await delay(500)
      await fetchWalletScore()
      await delay(500)
      await fetchWalletMetrics()
      await delay(500)
      await fetchNftAnalytics()
      await delay(500)
      await fetchNftTraders()
    } catch (error) {
      console.error("Error in sequential wallet fetch:", error)
      setError("Failed to complete wallet analysis")
    } finally {
      setIsSequentialLoading(false)
      // Clear tasks after 3 seconds if all completed
      setTimeout(() => {
        setSequentialTasks([])
      }, 3000)
    }
  }, [
    walletInfo,
    apiKey,
    fetchNftBalance,
    fetchTokenBalance,
    fetchWalletLabel,
    fetchWalletScore,
    fetchWalletMetrics,
    fetchNftAnalytics,
    fetchNftTraders,
  ])

  // Extract wallet info when tab info changes
  useEffect(() => {
    if (tabInfo?.url) {
      const extractedWallet = extractWalletFromUrl(tabInfo.url)
      if (extractedWallet) {
        setWalletInfo(extractedWallet)
        setError(null)
      }
    }
  }, [tabInfo])

  // Helper functions
  const formatCurrency = (value: number | string, currency = "USD") => {
    const numValue = typeof value === "string" ? Number.parseFloat(value) : value
    if (isNaN(numValue)) return "N/A"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue)
  }

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + "M"
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + "K"
    }
    return value.toString()
  }

  const getRiskColor = (riskCategory: number) => {
    if (riskCategory <= 2) return "bg-green-100 text-green-800 border-4 border-green-600"
    if (riskCategory <= 4) return "bg-yellow-100 text-yellow-800 border-4 border-yellow-600"
    return "bg-red-100 text-red-800 border-4 border-red-600"
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    if (score >= 40) return "text-orange-600"
    return "text-red-600"
  }

  const getChangeColor = (change: number | null) => {
    if (change === null) return "text-gray-500"
    return change >= 0 ? "text-green-600" : "text-red-600"
  }

  const getChangeIcon = (change: number | null) => {
    if (change === null) return null
    return change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />
  }

  // Loading indicator component
  const LoadingIndicator = ({ message }: { message: string }) => (
    <div className="flex items-center space-x-2 p-2 md:p-4 bg-blue-100 border-4 border-black">
      <LoaderCircle className="h-4 w-4 md:h-5 md:w-5 animate-spin text-blue-600" />
      <span className="font-bold text-xs md:text-sm">{message}</span>
    </div>
  )

  // Sequential progress indicator
  const SequentialProgressIndicator = () => (
    <div className="bg-yellow-100 border-4 border-black p-3 md:p-4 mb-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <h3 className="font-black text-sm md:text-base mb-2 md:mb-3 flex items-center">
        <Activity className="h-5 w-5 mr-2" />
        WALLET ANALYSIS PROGRESS
      </h3>
      <div className="space-y-2 md:space-y-3">
        {sequentialTasks.map((task, index) => (
          <div key={index} className="flex items-center space-x-2 md:space-x-3">
            {task.status === "loading" && <LoaderCircle className="h-4 w-4 md:h-5 md:w-5 animate-spin text-blue-600" />}
            {task.status === "success" && <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600" />}
            {task.status === "error" && <XCircle className="h-4 w-4 md:h-5 md:w-5 text-red-600" />}
            <span className="text-xs md:text-sm font-bold">{task.name}:</span>
            <span className="text-xs md:text-sm">{task.message}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // Pagination component
  const PaginationControls = ({
    currentPage,
    totalItems,
    itemsPerPage,
    onPageChange,
  }: {
    currentPage: number
    totalItems: number
    itemsPerPage: number
    onPageChange: (page: number) => void
  }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage)
    return (
      <div className="flex flex-col gap-2 items-center justify-between mt-4 p-3 bg-gray-100 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="text-sm font-bold text-black">
          Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of{" "}
          {totalItems} items
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="border-4 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-black px-3 py-1 bg-white border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="border-4 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Enhanced NFT Balance Component
  const EnhancedNFTBalance = () => {
    if (loadingStates.nftBalance) {
      return <LoadingIndicator message="Loading NFT balance..." />
    }

    if (!nftBalance?.data || !Array.isArray(nftBalance.data) || nftBalance.data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">No NFTs found in this wallet</p>
        </div>
      )
    }

    const startIndex = (nftPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const paginatedNFTs = nftBalance.data.slice(startIndex, endIndex)

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedNFTs.map((nft: any, index: number) => (
            <Card
              key={index}
              className="border-4 border-black bg-purple-50 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-purple-200 text-purple-800 border-2 border-black font-black">
                      {nft.contract_type}
                    </Badge>
                    <Badge className="bg-blue-200 text-blue-800 border-2 border-black font-black">
                      {nft.blockchain}
                    </Badge>
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-gray-800 truncate">{nft.collection}</h4>
                    <p className="text-xs font-bold text-gray-600">Token ID: {nft.token_id}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-500">QUANTITY</p>
                      <p className="font-black text-lg text-purple-600">{nft.quantity}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-500">CHAIN ID</p>
                      <p className="font-black text-lg text-blue-600">{nft.chain_id}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t-4 border-purple-300">
                    <p className="text-xs font-bold text-gray-500 mb-1">CONTRACT ADDRESS</p>
                    <p className="text-xs font-mono bg-white p-2 border-2 border-black break-all">
                      {nft.contract_address}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <PaginationControls
          currentPage={nftPage}
          totalItems={nftBalance.data.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setNftPage}
        />
      </div>
    )
  }

  // Enhanced Token Balance Component
  const EnhancedTokenBalance = () => {
    if (loadingStates.tokenBalance) {
      return <LoadingIndicator message="Loading token balance..." />
    }

    if (!tokenBalance?.data || !Array.isArray(tokenBalance.data) || tokenBalance.data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Coins className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">No tokens found in this wallet</p>
        </div>
      )
    }

    const startIndex = (tokenPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const paginatedTokens = tokenBalance.data.slice(startIndex, endIndex)

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedTokens.map((token: any, index: number) => (
            <Card
              key={index}
              className="border-4 border-black bg-blue-50 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-blue-200 text-blue-800 border-2 border-black font-black">
                      {token.token_symbol}
                    </Badge>
                    <Badge className="bg-green-200 text-green-800 border-2 border-black font-black">
                      {token.blockchain}
                    </Badge>
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-gray-800 truncate">{token.token_name || "Unknown Token"}</h4>
                    <p className="text-xs font-bold text-gray-600">Decimals: {token.decimal}</p>
                  </div>
                  <div className="text-center bg-white p-3 border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <p className="text-xs font-bold text-gray-500">BALANCE</p>
                    <p className="font-black text-xl text-blue-600">
                      {formatNumber(Number.parseFloat(token.quantity))}
                    </p>
                    <p className="text-xs font-bold text-gray-600">{token.token_symbol}</p>
                  </div>
                  <div className="pt-2 border-t-4 border-blue-300">
                    <p className="text-xs font-bold text-gray-500 mb-1">TOKEN ADDRESS</p>
                    <p className="text-xs font-mono bg-white p-2 border-2 border-black break-all">
                      {token.token_address}
                    </p>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-600">
                    <span>Chain ID: {token.chain_id}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <PaginationControls
          currentPage={tokenPage}
          totalItems={tokenBalance.data.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setTokenPage}
        />
      </div>
    )
  }

  // Enhanced Wallet Label Component
  const EnhancedWalletLabel = () => {
    if (loadingStates.walletLabel) {
      return <LoadingIndicator message="Loading wallet labels..." />
    }

    if (!walletLabel?.data || !Array.isArray(walletLabel.data) || walletLabel.data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">No labels found for this wallet</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {walletLabel.data.map((label: any, index: number) => {
          const trueFlags = Object.entries(label)
            .filter(([_, value]) => typeof value === "boolean" && value)
            .map(([key]) => key.replace(/_/g, " "))

          const nameFields = Object.entries(label)
            .filter(
              ([key, value]) =>
                key.endsWith("_name") && typeof value === "string" && value.trim() !== "" && value !== "0",
            )
            .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)

          return (
            <Card
              key={index}
              className={`border-4 border-black ${getRiskColor(label.risk_category)} hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-col md:flex-row">
                    <Badge className="bg-gray-200 text-gray-800 border-2 border-black font-black">
                      {label.blockchain} (Chain {label.chain_id})
                    </Badge>
                    <div className="flex items-center space-x-2">
                      <Badge className={`${getRiskColor(label.risk_category)} font-black`}>
                        RISK: {label.risk_category}
                      </Badge>
                      <Badge className="bg-purple-200 text-purple-800 border-2 border-black font-black">
                        DEPTH: {label.risk_depth}
                      </Badge>
                    </div>
                  </div>

                  {trueFlags.length > 0 && (
                    <div>
                      <p className="text-sm font-black text-gray-700 mb-2">ACTIVE FLAGS:</p>
                      <div className="flex flex-wrap gap-2">
                        {trueFlags.map((flag, idx) => (
                          <Badge key={idx} className="bg-yellow-200 text-yellow-800 border-2 border-black font-black">
                            {flag.replace(/(^\w|\s\w)/g, (s) => s.toUpperCase())}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {nameFields.length > 0 && (
                    <div>
                      <p className="text-sm font-black text-gray-700 mb-2">NAMED ENTITIES:</p>
                      <div className="space-y-1">
                        {nameFields.map((field, idx) => (
                          <p key={idx} className="text-sm bg-white p-2 border-2 border-black font-bold">
                            {field}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {trueFlags.length === 0 && nameFields.length === 0 && (
                    <p className="text-sm text-gray-500 font-bold italic">No positive labels recorded.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  // Enhanced Wallet Score Component with Charts
  const EnhancedWalletScore = () => {
    if (loadingStates.walletScore) {
      return <LoadingIndicator message="Loading wallet score..." />
    }

    if (!walletScore?.data || !Array.isArray(walletScore.data) || walletScore.data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">No wallet score data available</p>
        </div>
      )
    }

    const scoreData = walletScore.data[0]
    const overallScore = scoreData.wallet_score || 0

    // Prepare data for charts
    const scoreBreakdown = [
      { name: "Anomalous Pattern", value: scoreData.anomalous_pattern_score || 0 },
      { name: "Associated Token", value: scoreData.associated_token_score || 0 },
      { name: "Centralized Interaction", value: scoreData.centralized_interaction_score || 0 },
      { name: "Frequency", value: scoreData.frequency_score || 0 },
      { name: "Risk Interaction", value: scoreData.risk_interaction_score || 0 },
      { name: "Smart Contract", value: scoreData.smart_contract_interaction_score || 0 },
      { name: "Staking/Governance", value: scoreData.staking_governance_interaction_score || 0 },
      { name: "Volume", value: scoreData.volume_score || 0 },
      { name: "Wallet Age", value: scoreData.wallet_age_score || 0 },
    ]

    const radialData = [
      {
        name: "Score",
        value: overallScore,
        fill: overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#f59e0b" : "#ef4444",
      },
    ]

    return (
      <div className="space-y-6">
        {/* Overall Score Display */}
        <Card className="border-4 border-black bg-indigo-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardContent className="p-6">
            <div className="text-center">
              <h3 className="text-lg font-black text-gray-800 mb-2 uppercase">OVERALL WALLET SCORE</h3>
              <div className="flex items-center justify-center space-x-4">
                <div className="text-center">
                  <div className={`text-4xl font-black ${getScoreColor(overallScore)}`}>{overallScore.toFixed(1)}</div>
                  <Badge
                    className={`mt-2 font-black border-2 border-black ${
                      scoreData.classification === "low_risk"
                        ? "bg-green-200 text-green-800"
                        : scoreData.classification === "medium_risk"
                          ? "bg-yellow-200 text-yellow-800"
                          : "bg-red-200 text-red-800"
                    }`}
                  >
                    {scoreData.classification?.replace("_", " ").toUpperCase()}
                  </Badge>
                </div>
                <div className="w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={radialData}>
                      <RadialBar dataKey="value" cornerRadius={10} fill={radialData[0].fill} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score Breakdown Chart */}
        <Card className="border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center uppercase p-4">
              <BarChart3 className="h-5 w-5 mr-2" />
              SCORE BREAKDOWN
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 bg-gray-50 border-2 border-black p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreBreakdown} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} stroke="#000" strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Risk Information */}
        {(scoreData.blockchain_with_illicit || scoreData.blockchain_without_illicit) && (
          <Card className="border-4 border-black bg-orange-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4">
              <h4 className="font-black text-gray-800 mb-3 uppercase">BLOCKCHAIN RISK ASSESSMENT</h4>
              <div className="space-y-2">
                {scoreData.blockchain_with_illicit && (
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-red-200 text-red-800 border-2 border-black font-black">HIGH RISK</Badge>
                    <span className="text-sm font-bold">{scoreData.blockchain_with_illicit}</span>
                  </div>
                )}
                {scoreData.blockchain_without_illicit && (
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-green-200 text-green-800 border-2 border-black font-black">CLEAN</Badge>
                    <span className="text-sm font-bold">{scoreData.blockchain_without_illicit}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // Enhanced Wallet Metrics Component
  const EnhancedWalletMetrics = () => {
    if (loadingStates.walletMetrics) {
      return <LoadingIndicator message="Loading wallet metrics..." />
    }

    if (!walletMetrics?.data || !Array.isArray(walletMetrics.data) || walletMetrics.data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">No wallet metrics data available</p>
        </div>
      )
    }

    const metrics = walletMetrics.data[0]

    // Prepare data for charts
    const volumeData = [
      { name: "Inflow", eth: metrics.inflow_amount_eth, usd: metrics.inflow_amount_usd },
      { name: "Outflow", eth: metrics.outflow_amount_eth, usd: metrics.outflow_amount_usd },
    ]

    const transactionData = [
      { name: "Incoming", value: metrics.in_txn },
      { name: "Outgoing", value: metrics.out_txn },
    ]

    const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#6366f1"]

    return (
      <div className="space-y-6">
        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-4 border-black bg-blue-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-black text-blue-600">{metrics.wallet_age}</div>
              <div className="text-sm font-bold text-gray-600 uppercase">Days Old</div>
            </CardContent>
          </Card>
          <Card className="border-4 border-black bg-green-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-black text-green-600">{metrics.wallet_active_days}</div>
              <div className="text-sm font-bold text-gray-600 uppercase">Active Days</div>
            </CardContent>
          </Card>
          <Card className="border-4 border-black bg-purple-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-black text-purple-600">{formatNumber(metrics.total_txn)}</div>
              <div className="text-sm font-bold text-gray-600 uppercase">Total Transactions</div>
            </CardContent>
          </Card>
          <Card className="border-4 border-black bg-orange-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-black text-orange-600">{metrics.token_cnt}</div>
              <div className="text-sm font-bold text-gray-600 uppercase">Unique Tokens</div>
            </CardContent>
          </Card>
        </div>

        {/* Volume Chart */}
        <Card className="border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardHeader>
            <CardTitle className="text-lg p-4 font-black flex items-center uppercase">
              <BarChart3 className="h-5 w-5 mr-2" />
              VOLUME ANALYSIS (ETH)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-50 border-2 border-black p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => [typeof value === "number" ? value.toFixed(4) : value, "ETH"]} />
                  <Bar dataKey="eth" fill="#6366f1" radius={[4, 4, 0, 0]} stroke="#000" strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Transaction Distribution */}
        <Card className="border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center uppercase p-4">
              <Activity className="h-5 w-5 mr-2" />
              TRANSACTION DISTRIBUTION
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-50 border-2 border-black p-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={transactionData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    stroke="#000"
                    strokeWidth={2}
                  >
                    {transactionData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Metrics */}
        <Card className="border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase">DETAILED METRICS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-black text-gray-700 mb-2 uppercase">Current Balance</h4>
                  <div className="bg-green-100 p-3 border-4 border-green-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <p className="text-lg font-black text-green-600">{metrics.balance_eth.toFixed(4)} ETH</p>
                    <p className="text-sm font-bold text-gray-600">{formatCurrency(metrics.balance_usd)}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-gray-700 mb-2 uppercase">Network Activity</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-bold text-gray-600">Inflow Addresses:</span>
                      <span className="font-black">{metrics.inflow_addresses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-bold text-gray-600">Outflow Addresses:</span>
                      <span className="font-black">{metrics.outflow_addresses}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="font-black text-gray-700 mb-2 uppercase">Activity Timeline</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-bold text-gray-600">First Active:</span>
                      <span className="font-black">{new Date(metrics.first_active_day).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-bold text-gray-600">Last Active:</span>
                      <span className="font-black">{new Date(metrics.last_active_day).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                {(metrics.illicit_volume > 0 || metrics.mixer_volume > 0 || metrics.sanction_volume > 0) && (
                  <div>
                    <h4 className="font-black text-red-700 mb-2 uppercase">⚠️ Risk Indicators</h4>
                    <div className="bg-red-100 p-3 border-4 border-red-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm font-bold text-red-600">Illicit Volume:</span>
                        <span className="font-black text-red-700">{metrics.illicit_volume}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-bold text-red-600">Mixer Volume:</span>
                        <span className="font-black text-red-700">{metrics.mixer_volume}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-bold text-red-600">Sanction Volume:</span>
                        <span className="font-black text-red-700">{metrics.sanction_volume}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Enhanced NFT Analytics Component
  const EnhancedNFTAnalytics = () => {
    if (loadingStates.nftAnalytics) {
      return <LoadingIndicator message="Loading NFT analytics..." />
    }

    if (!nftAnalytics?.data || !Array.isArray(nftAnalytics.data) || nftAnalytics.data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">No NFT analytics data available</p>
        </div>
      )
    }

    const analytics = nftAnalytics.data[0]

    // Prepare data for charts
    const volumeBreakdown = [
      { name: "Buy Volume", value: analytics.buy_volume || 0, fill: "#10b981" },
      { name: "Sell Volume", value: analytics.sell_volume || 0, fill: "#ef4444" },
    ]

    const activityData = [
      { name: "NFTs Bought", value: analytics.nft_bought || 0, change: analytics.nft_bought_change },
      { name: "NFTs Sold", value: analytics.nft_sold || 0, change: analytics.nft_sold_change },
      { name: "Transfers", value: analytics.nft_transfer || 0, change: analytics.nft_transfer_change },
      { name: "Sales", value: analytics.sales || 0, change: analytics.sales_change },
      { name: "Transactions", value: analytics.transactions || 0, change: analytics.transactions_change },
    ]

    return (
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-4 border-black bg-teal-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-teal-600">
                    {formatCurrency(analytics.volume_eth || analytics.volume || 0)}
                  </div>
                  <div className="text-sm font-bold text-gray-600 uppercase">Total Volume</div>
                </div>
                <div className={`flex items-center ${getChangeColor(analytics.volume_change)}`}>
                  {getChangeIcon(analytics.volume_change)}
                  <span className="text-sm font-black ml-1">
                    {analytics.volume_change ? `${(analytics.volume_change * 100).toFixed(1)}%` : "N/A"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-4 border-black bg-green-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-green-600">{analytics.nft_bought || 0}</div>
                  <div className="text-sm font-bold text-gray-600 uppercase">NFTs Bought</div>
                </div>
                <div className={`flex items-center ${getChangeColor(analytics.nft_bought_change)}`}>
                  {getChangeIcon(analytics.nft_bought_change)}
                  <span className="text-sm font-black ml-1">
                    {analytics.nft_bought_change ? `${(analytics.nft_bought_change * 100).toFixed(1)}%` : "N/A"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-4 border-black bg-red-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-red-600">{analytics.nft_sold || 0}</div>
                  <div className="text-sm font-bold text-gray-600 uppercase">NFTs Sold</div>
                </div>
                <div className={`flex items-center ${getChangeColor(analytics.nft_sold_change)}`}>
                  {getChangeIcon(analytics.nft_sold_change)}
                  <span className="text-sm font-black ml-1">
                    {analytics.nft_sold_change ? `${(analytics.nft_sold_change * 100).toFixed(1)}%` : "N/A"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Volume Breakdown Chart */}
        <Card className="border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center uppercase p-4">
              <BarChart3 className="h-5 w-5 mr-2" />
              VOLUME BREAKDOWN
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-50 border-2 border-black p-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={volumeBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                    stroke="#000"
                    strokeWidth={2}
                  >
                    {volumeBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Activity Metrics */}
        <Card className="border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center uppercase p-4">
              <Activity className="h-5 w-5 mr-2" />
              ACTIVITY METRICS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activityData.map((item, index) => (
                <div
                  key={index}
                  className="flex flex-col md:flex-row items-center justify-between p-3 bg-gray-100 border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-lg font-black text-gray-800">{item.value}</div>
                    <div className="text-sm font-bold text-gray-600 uppercase">{item.name}</div>
                  </div>
                  <div className={`flex items-center ${getChangeColor(item.change)}`}>
                    {getChangeIcon(item.change)}
                    <span className="text-sm font-black ml-1">
                      {item.change ? `${(item.change * 100).toFixed(1)}%` : "N/A"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Minted Value */}
        {analytics.minted_value !== 0 && (
          <Card className="border-4 border-black bg-purple-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-gray-700 mb-1 uppercase">MINTED VALUE</h4>
                  <div className="text-2xl font-black text-purple-600">{formatCurrency(analytics.minted_value)}</div>
                </div>
                <div className={`flex items-center ${getChangeColor(analytics.minted_value_change)}`}>
                  {getChangeIcon(analytics.minted_value_change)}
                  <span className="text-sm font-black ml-1">
                    {analytics.minted_value_change ? `${(analytics.minted_value_change * 100).toFixed(1)}%` : "N/A"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Blockchain Info */}
        <Card className="border-4 border-black bg-blue-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-gray-700 mb-1 uppercase">BLOCKCHAIN</h4>
                <Badge className="bg-blue-200 text-blue-800 border-2 border-black font-black">
                  {analytics.blockchain} (Chain {analytics.chain_id})
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-gray-500 uppercase">Last Updated</p>
                <p className="text-sm font-black">{new Date(analytics.updated_at).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Enhanced NFT Traders Component
  const EnhancedNFTTraders = () => {
    if (loadingStates.nftTraders) {
      return <LoadingIndicator message="Loading NFT traders..." />
    }

    if (!nftTraders?.data || !Array.isArray(nftTraders.data) || nftTraders.data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-bold">No NFT traders data available</p>
        </div>
      )
    }

    const traders = nftTraders.data[0]

    // Prepare data for charts
    const traderMetrics = [
      { name: "Total Traders", value: traders.traders || 0, change: traders.traders_change },
      { name: "Buyers", value: traders.traders_buyers || 0, change: traders.traders_buyers_change },
      { name: "Sellers", value: traders.traders_sellers || 0, change: traders.traders_sellers_change },
    ]

    return (
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {traderMetrics.map((metric, index) => (
            <Card key={index} className="border-4 border-black bg-cyan-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black text-cyan-600">{metric.value}</div>
                    <div className="text-sm font-bold text-gray-600 uppercase">{metric.name}</div>
                  </div>
                  <div className={`flex items-center ${getChangeColor(metric.change)}`}>
                    {getChangeIcon(metric.change)}
                    <span className="text-sm font-black ml-1">
                      {metric.change ? `${(metric.change * 100).toFixed(1)}%` : "N/A"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Blockchain Info */}
        <Card className="border-4 border-black bg-blue-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-gray-700 mb-1 uppercase">BLOCKCHAIN</h4>
                <Badge className="bg-blue-200 text-blue-800 border-2 border-black font-black">
                  {traders.blockchain} (Chain {traders.chain_id})
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-gray-500 uppercase">Last Updated</p>
                <p className="text-sm font-black">{new Date(traders.updated_at).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Enhanced Data Card Component
  const EnhancedDataCard = ({
    title,
    icon,
    bgColor = "bg-white",
    children,
  }: {
    title: string
    icon: React.ReactNode
    bgColor?: string
    children: React.ReactNode
  }) => (
    <Card
      className={`${bgColor} border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all`}
    >
      <CardHeader className="pb-0">
        <CardTitle className="text-lg font-black flex items-center bg-orange-200 p-3 border-2 border-black uppercase">
          {icon}
          <span className="ml-2">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 p-4">{children}</CardContent>
    </Card>
  )

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {error && (
        <div className="p-3 md:p-4 bg-red-100 border-4 border-black text-black font-bold mb-4 text-sm md:text-base shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-600 hover:text-red-800 font-black">
            ✕
          </button>
        </div>
      )}

      {/* Sequential progress indicator */}
      {(isSequentialLoading || sequentialTasks.length > 0) && <SequentialProgressIndicator />}

      <div className="space-y-3 md:space-y-4 min-w-0">
        <Separator className="bg-black" />

        {isSidepanel && (
          <div className="bg-blue-100 flex flex-col gap-4 p-3 border-4 border-black min-w-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between min-w-0 gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-bold truncate">Current Page: {tabInfo?.title || "Loading..."}</p>
                <p className="text-xs text-gray-600 truncate min-w-0">{tabInfo?.url || ""}</p>
              </div>
              <Button
                onClick={refreshTabInfo}
                disabled={tabLoading}
                size="sm"
                variant="outline"
                className="border-4 border-black flex-shrink-0 bg-white hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <RefreshCw className={`h-4 w-4 ${tabLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            if (isSidepanel && tabInfo?.url) {
              const extractedWallet = extractWalletFromUrl(tabInfo.url)
              if (extractedWallet) {
                setWalletInfo(extractedWallet)
                setError(null)
              } else {
                setError("Unable to extract wallet address. Please make sure you are on an OpenSea wallet page.")
                setWalletInfo(null)
              }
            } else {
              if (typeof chrome !== "undefined" && chrome.runtime) {
                chrome.runtime.sendMessage({ type: "GET_TAB_INFO" }, (response: any) => {
                  if (response?.url) {
                    const extractedWallet = extractWalletFromUrl(response.url)
                    if (extractedWallet) {
                      setWalletInfo(extractedWallet)
                      setError(null)
                    } else {
                      setError("Unable to extract wallet address. Please make sure you are on an OpenSea wallet page.")
                      setWalletInfo(null)
                    }
                  }
                })
              }
            }
          }}
          className="w-full bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all text-sm md:text-base min-w-0 break-words"
        >
          {isSidepanel ? "Extract Wallet from Current Page" : "Extract Wallet Address"}
        </button>

        {walletInfo && (
          <div className="space-y-3 md:space-y-4 min-w-0">
            <div className="space-y-2 bg-yellow-100 p-3 md:p-4 border-4 border-black min-w-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-xs md:text-sm font-bold min-w-0">
                Wallet Address: <span className="text-blue-600 break-all font-mono text-xs">{walletInfo.address}</span>
              </p>
              <p className="text-xs md:text-sm font-bold min-w-0">
                Blockchain: <span className="text-blue-600 break-words">{walletInfo.blockchain}</span>
              </p>
            </div>

            <Separator className="bg-black" />

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-bold">Label on:</span>
              <select
                value={labelChain}
                onChange={(e) => setLabelChain(e.target.value)}
                className="border-4 border-black text-xs p-1 bg-white font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                {BLOCKCHAIN_OPTIONS.map((opt) => (
                  <option value={opt} key={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <Separator className="bg-black" />

            <AICopilotChatbot />

            <Separator className="bg-black" />

            <button
              onClick={sequentialFetchAllWalletData}
              disabled={isSequentialLoading}
              className="w-full bg-green-200 hover:bg-green-300 disabled:bg-gray-200 disabled:cursor-not-allowed text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center text-sm md:text-base min-w-0"
            >
              {isSequentialLoading ? (
                <div className="flex items-center min-w-0">
                  <LoaderCircle className="h-4 w-4 animate-spin mr-2 flex-shrink-0" />
                  <span className="text-xs md:text-sm truncate">Analyzing Wallet...</span>
                </div>
              ) : (
                "Analyze Wallet Address"
              )}
            </button>

            {/* Enhanced Data Cards Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
              <EnhancedDataCard title="NFT Balance" icon={<Wallet className="h-5 w-5" />} bgColor="bg-purple-50">
                <EnhancedNFTBalance />
              </EnhancedDataCard>

              <EnhancedDataCard title="Token Balance" icon={<Coins className="h-5 w-5" />} bgColor="bg-blue-50">
                <EnhancedTokenBalance />
              </EnhancedDataCard>

              <EnhancedDataCard title="Wallet Labels" icon={<Shield className="h-5 w-5" />} bgColor="bg-yellow-50">
                <EnhancedWalletLabel />
              </EnhancedDataCard>

              <EnhancedDataCard title="Wallet Score" icon={<BarChart3 className="h-5 w-5" />} bgColor="bg-indigo-50">
                <EnhancedWalletScore />
              </EnhancedDataCard>

              <EnhancedDataCard title="Wallet Metrics" icon={<Activity className="h-5 w-5" />} bgColor="bg-red-50">
                <EnhancedWalletMetrics />
              </EnhancedDataCard>

              <EnhancedDataCard title="NFT Analytics" icon={<BarChart3 className="h-5 w-5" />} bgColor="bg-teal-50">
                <EnhancedNFTAnalytics />
              </EnhancedDataCard>

              <EnhancedDataCard title="NFT Traders" icon={<Users className="h-5 w-5" />} bgColor="bg-cyan-50">
                <EnhancedNFTTraders />
              </EnhancedDataCard>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WalletAnalysis
