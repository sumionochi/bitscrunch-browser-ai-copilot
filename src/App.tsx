import type React from "react"
import { useEffect, useState, useCallback, useRef } from "react"
import axios from "axios"
import { LoaderCircle, CheckCircle, XCircle, RefreshCw } from "lucide-react"
import Chart from "./components/Chart"
import { format } from "date-fns"
import { metricsData } from "./data/DataLists.ts"
import Filters from "./Filters"
import { Input } from "./components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card"
import NftPriceCard from "./components/NftPriceCard.tsx"
import NftCollectionPriceCard from "./components/NftCollectionPriceCard.tsx"
import NftTransaction from "./components/NftTransaction.tsx"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import NftTraders from "./components/NftTraders"
import NftAnalytics from './components/NftAnalytics'
import { useChromeExtension } from './hooks/useChromeExtension'
import { Button } from "./components/ui/button"
import { Separator } from "./components/ui/separator.tsx"
import WalletAnalysis from "./components/WalletAnalysis"
// ─── Copilot extra imports ────────────────────────────────────────────────
import {
  Bot, Send, MessageCircle, X, Minimize2, Maximize2,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, LineChart, Line
} from "recharts"


export interface Blockchain {
  id: number;
  name: string;
  symbol: string;
  chain_id: number;
  description: string;
  image_url: string;
}

interface MarketTrendTimestamp {
  timestamp: string
}

interface MarketTrendDataDetails {
  [key: string]: number
}

type MarketTrendData = MarketTrendTimestamp & MarketTrendDataDetails

interface TradersData {
  block_dates: string[]
  traders_trend: number[]
  traders_buyers_trend: number[]
  traders_sellers_trend: number[]
}

interface WashtradeData {
  block_dates: string[]
  washtrade_assets_trend: number[]
  washtrade_suspect_sales_trend: number[]
  washtrade_volume_trend: number[]
}

interface PriceEstimateData {
  address: string;
  chain_id: number;
  collection_drivers: string;
  collection_name: string;
  nft_rarity_drivers: string;
  nft_sales_drivers: string;
  prediction_percentile: string;
  price_estimate: number;
  price_estimate_lower_bound: number;
  price_estimate_upper_bound: number;
  thumbnail_palette: string;
  thumbnail_url: string;
  token_id: string;
  token_image_url: string;
}

interface CacheData {
  data: any;
  timestamp: number;
  expiresIn: number;
}

interface LoadingState {
  blockchains: boolean;
  marketTrend: boolean;
  traders: boolean;
  washtrade: boolean;
  nftPrice: boolean;
  collectionPrice: boolean;
}

interface SequentialTaskStatus {
  name: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  message: string;
}

// Cache duration in milliseconds
const CACHE_DURATION = {
  BLOCKCHAINS: 30 * 60 * 1000, // 30 minutes
  MARKET_TREND: 2 * 60 * 1000, // 2 minutes
  TRADERS: 5 * 60 * 1000, // 5 minutes
  WASHTRADE: 5 * 60 * 1000, // 5 minutes
  NFT_PRICE: 10 * 60 * 1000, // 10 minutes
  COLLECTION_PRICE: 10 * 60 * 1000, // 10 minutes
};

const App: React.FC = () => {
  const [data, setData] = useState<MarketTrendData[]>([])
  const [metric, setMetric] = useState<string>("volume")
  const [blockchain, setBlockchain] = useState<string>("1")
  const [blockchainString, setBlockchainString] = useState<string>("ethereum")
  const [optionBlockchain, setOptionBlockchain] = useState<Blockchain[]>([])
  const [timeRange, setTimeRange] = useState<string>("24h")
  const [nftDetails, setNftDetails] = useState<{ blockchain: string; contractAddress: string; tokenId: string } | null>(null)
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimateData | null>(null)
  const [collectionPriceEstimate, setCollectionPriceEstimate] = useState<PriceEstimateData[] | null>(null)
  const [activeTab, setActiveTab] = useState<"nft-details" | "nft-transaction" | "nft-traders" | "nft-analytics" | "wallet-analysis" | "trends">("nft-details")  
  const [Tradersdata, setTradersData] = useState<TradersData | null>(null)
  const [washtradeData, setWashtradeData] = useState<{
    block_dates: string[]
    washtrade_assets_trend: number[]
    washtrade_suspect_sales_trend: number[]
    washtrade_volume_trend: number[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Chrome extension hook
  const { tabInfo, isSidepanel, apiKey, setApiKey, refreshTabInfo, loading: tabLoading } = useChromeExtension()

  // Sequential loading states
  const [sequentialTasks, setSequentialTasks] = useState<SequentialTaskStatus[]>([])
  const [isSequentialLoading, setIsSequentialLoading] = useState(false)

  /* ────────────────  AI Copilot state ──────────────── */
interface ChartSpec { type:"bar"|"pie"|"line"; chartData:any[]; config?:any }
interface ChatMsg { id:string; role:"user"|"assistant"; content:string; timestamp:Date }
interface ChatBox { messages:ChatMsg[]; isOpen:boolean; isMin:boolean; isStreaming:boolean }

const [chat, setChat] = useState<ChatBox>({
  messages:[], isOpen:false, isMin:false, isStreaming:false
})
const [openaiApiKey,setOpenaiApiKey]=useState("")
const chatInputRef=useRef<HTMLInputElement>(null)
const chatScrollRef=useRef<HTMLDivElement>(null)

/* —— Data gate —— */
const trendsReady = !!(
  data.length && Tradersdata && washtradeData
)

/* —— Context builder —— */
const ctxJSON = () => JSON.stringify({
  metric, blockchain, timeRange,
  marketTrend:data.slice(-25), // keep payload light
  traders:Tradersdata,
  washtrade:washtradeData
},null,2)

/* —— Chart renderer (same as WalletAnalysis) —— */
const ChartRenderer:React.FC<{spec:ChartSpec}> = ({spec})=>{
  const {type,chartData,config}=spec
  const COLORS=["#10b981","#ef4444","#f59e0b","#6366f1"]
  const commonTooltip={contentStyle:{border:"4px solid black",background:"white",fontWeight:"bold",boxShadow:"4px 4px 0 0 #000"}}
  if(!Array.isArray(chartData))return null
  return(
    <div className="w-full h-48 bg-gray-50 border-4 border-black p-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
      {type==="bar"&&(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey={config?.xKey||"name"} fontSize={10}/>
            <YAxis fontSize={10}/>
            <Tooltip {...commonTooltip}/>
            <Bar dataKey={config?.yKey||"value"} fill="#6366f1" barSize={28} radius={[2,2,0,0]} stroke="#000" strokeWidth={2}/>
          </BarChart>
        </ResponsiveContainer>
      )}
      {type==="pie"&&(
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" outerRadius={80} dataKey={config?.valueKey||"value"} stroke="#000" strokeWidth={2}
              label={({name,value})=>`${name}: ${value}`}>
              {chartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Pie>
            <Tooltip {...commonTooltip}/>
          </PieChart>
        </ResponsiveContainer>
      )}
      {type==="line"&&(
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey={config?.xKey||"name"} fontSize={10}/>
            <YAxis fontSize={10}/>
            <Tooltip {...commonTooltip}/>
            <Line type="monotone" dataKey={config?.yKey||"value"} stroke="#6366f1" strokeWidth={3}
              dot={{fill:"#6366f1",stroke:"#000",strokeWidth:2,r:4}}/>
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

/* —— Text formatter —— */
const fmtTxt=(t:string)=>t.split("\n").map((l,i)=>{
  const b=l.replace(/\*\*(.*?)\*\*/g,'<strong class="font-black bg-yellow-200 px-1 border-2 border-black">$1</strong>')
  const c=b.replace(/`(.*?)`/g,'<code class="bg-gray-200 px-2 py-1 border-2 border-black font-mono text-xs">$1</code>')
  return <div key={i} dangerouslySetInnerHTML={{__html:c}}/>
})

const MsgContent:React.FC<{content:string}> = ({content})=>{
  const m=content.match(/```chart\n([\s\S]*?)\n```/)
  if(m){
    try{
      const spec=JSON.parse(m[1]) as ChartSpec
      const rest=content.replace(/```chart\n[\s\S]*?\n```/,"").trim()
      return(<div className="space-y-3">{rest&&<div className="formatted-text">{fmtTxt(rest)}</div>}<ChartRenderer spec={spec}/></div>)
    }catch{}
  }
  return <div className="formatted-text">{fmtTxt(content)}</div>
}

/* —— OpenAI streaming —— */
const askOpenAI=async(userMsg:string)=>{
  if(!openaiApiKey)throw new Error("API key missing")
  const res=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{Authorization:`Bearer ${openaiApiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"gpt-4o-mini",
      stream:true,
      temperature:0.7,
      max_tokens:1000,
      messages:[
        {role:"system",content:
            `You are an AI assistant helping users analyse broad NFT-market trends. Context Data:\n${ctxJSON()}
            Please provide helpful, accurate responses based on this wallet data. When users ask about specific tokens, NFTs, scores, or metrics, reference the actual data provided. Format your responses clearly and highlight important information using **bold text** for emphasis.
              When a visual would help, respond with **one JSON spec wrapped in a triple-back-tick fence labelled "chart"**:\n` +
              `\`\`\`chart\n{\n  "type":"<bar|pie|line>",\n  "chartData":[{"name":"label","value":123},…],\n  "config":{"xKey":"name","yKey":"value","valueKey":"value"}\n}\n\`\`\`\n` +
              `Return **exactly one** such fenced block if (and only if) a chart is useful. The front-end will render it automatically.`,},
        {role:"user",content:userMsg}
      ]
    })
  })
  if(!res.ok)throw new Error(res.statusText)
  return res.body
}

const submitChat=async(e:React.FormEvent)=>{
  e.preventDefault()
  const text = chatInputRef.current?.value.trim() ?? ''
  if (!text || chat.isStreaming) return
  const user:{id:string;role:"user";content:string;timestamp:Date}={
    id:Date.now().toString(),role:"user",content:text,timestamp:new Date()
  }
  setChat(p=>({...p,messages:[...p.messages,user],isStreaming:true}))
  if (chatInputRef.current) chatInputRef.current.value = ''
  try{
    const stream=await askOpenAI(user.content)
    const reader=stream?.getReader()
    const dec=new TextDecoder()
    const assistant:{id:string;role:"assistant";content:string;timestamp:Date}={id:(Date.now()+1).toString(),role:"assistant",content:"",timestamp:new Date()}
    setChat(p=>({...p,messages:[...p.messages,assistant]}))
    if(reader)
      while(true){
        const {done,value}=await reader.read()
        if(done)break
        const chunk=dec.decode(value)
        chunk.split("\n").forEach(l=>{
          if(!l.startsWith("data: "))return
          const d=l.slice(6)
          if(d==="[DONE]")return
          try{
            const json=JSON.parse(d)
            const delta=json.choices?.[0]?.delta?.content||""
            if(delta) setChat(p=>{
              const msgs=[...p.messages]
              msgs[msgs.length-1].content+=delta
              return {...p,messages:msgs}
            })
          }catch{}
        })
      }
  }catch(err:any){
    setChat(p=>({...p,messages:[...p.messages,{id:(Date.now()+2).toString(),role:"assistant",content:`Error: ${err.message}`,timestamp:new Date()}]}))
  }finally{ setChat(p=>({...p,isStreaming:false})) }
}

/* —— Auto-scroll & focus —— */
useEffect(()=>{ if(chatScrollRef.current&&chat.isOpen&&!chat.isMin)
  chatScrollRef.current.scrollTop=chatScrollRef.current.scrollHeight
},[chat.messages,chat.isOpen,chat.isMin])
useEffect(()=>{ if(chat.isOpen&&!chat.isMin&&chatInputRef.current) chatInputRef.current.focus() },[chat.isOpen,chat.isMin])


// 👉 Utility to turn "{a,b,c}" into ['a','b','c'] or numbers
const parseBraceArray = <T extends string | number = string>(raw: string | any): T[] => {
  if (!raw) return [] as T[]
  
  // Convert to string if it's not already a string
  const stringValue = typeof raw === 'string' ? raw : String(raw)
  
  return stringValue
    .replace(/^{|}$/g, '')
    .split(',')
    .map(v => v.trim().replace(/^"|"$/g, ''))
    .map(v => {
      const num = Number(v)
      return (isNaN(num) ? v : num) as T
    })
}

  // Loading states
  const [loadingStates, setLoadingStates] = useState<LoadingState>({
    blockchains: false,
    marketTrend: false,
    traders: false,
    washtrade: false,
    nftPrice: false,
    collectionPrice: false,
  })

  // Cache storage
  const cacheRef = useRef<{ [key: string]: CacheData }>({})
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiKey = e.target.value
    setApiKey(newApiKey)
    // Also save to localStorage for backward compatibility
    if (window.localStorage) {
      window.localStorage.setItem("nft_analytics_api_key", newApiKey)
    }
  }

  // Update NFT details when tab info changes
  useEffect(() => {
    if (tabInfo?.nftDetails) {
      setNftDetails(tabInfo.nftDetails)
    }
  }, [tabInfo])

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
    setLoadingStates(prev => ({ ...prev, [key]: value }))
  }

  // Update sequential task status
  const updateSequentialTaskStatus = (taskName: string, status: SequentialTaskStatus['status'], message: string) => {
    setSequentialTasks(prev => prev.map(task => 
      task.name === taskName ? { ...task, status, message } : task
    ))
  }

  // Initialize sequential tasks
  const initializeSequentialTasks = () => {
    setSequentialTasks([
      { name: 'blockchains', status: 'pending', message: 'Waiting to load blockchains...' },
      { name: 'marketTrend', status: 'pending', message: 'Waiting to load market trend...' },
      { name: 'traders', status: 'pending', message: 'Waiting to load traders data...' },
      { name: 'washtrade', status: 'pending', message: 'Waiting to load washtrade data...' }
    ])
  }

  // Fetch blockchains with cache
  const fetchBlockchains = useCallback(async () => {
    if (!apiKey) return false

    const cacheKey = getCacheKey('blockchains', { offset: 0, limit: 30 })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setOptionBlockchain(cached)
      updateSequentialTaskStatus('blockchains', 'success', 'Blockchains loaded from cache')
      return true
    }

    updateSequentialTaskStatus('blockchains', 'loading', 'Fetching supported blockchains...')
    updateLoadingState('blockchains', true)
    
    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v2/blockchains", {
        params: {
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
      })

      console.log(response.data)
      
      const blockchains = response.data.data
      setOptionBlockchain(blockchains)
      setCachedData(cacheKey, blockchains, CACHE_DURATION.BLOCKCHAINS)
      updateSequentialTaskStatus('blockchains', 'success', 'Blockchains loaded successfully')
      return true
    } catch (err) {
      console.error("Error fetching blockchains:", err)
      updateSequentialTaskStatus('blockchains', 'error', 'Failed to fetch blockchains')
      return false
    } finally {
      updateLoadingState('blockchains', false)
    }
  }, [apiKey])

  // Fetch market trend with cache
  const fetchMarketTrend = useCallback(async () => {
    if (!apiKey) return false

    const cacheKey = getCacheKey('market_trend', { blockchain, metric, timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setData(cached)
      updateSequentialTaskStatus('marketTrend', 'success', 'Market trend loaded from cache')
      return true
    }

    updateSequentialTaskStatus('marketTrend', 'loading', 'Fetching market trend data...')
    updateLoadingState('marketTrend', true)
    
    try {
      const response = await axios.get("https://api.unleashnfts.com/api/v1/market/trend", {
        params: {
          currency: "usd",
          blockchain: blockchain,
          metrics: metric,
          time_range: timeRange,
          include_washtrade: "true",
        },
        headers: { "x-api-key": apiKey },
      })

      console.log(response.data)

      const validMarketTrendData = response.data.data_points
        .filter((pt: { values: Record<string, string | number> }) =>
          pt.values[metric] !== "NA",
        )
        .map((pt: { date: string; values: Record<string, number> }) => ({
          timestamp: format(new Date(pt.date), "MMM dd, yyyy HH:mm"),
          [metric]: pt.values[metric],
        }))

      setData(validMarketTrendData)
      setCachedData(cacheKey, validMarketTrendData, CACHE_DURATION.MARKET_TREND)
      updateSequentialTaskStatus('marketTrend', 'success', 'Market trend loaded successfully')
      return true
    } catch (err) {
      console.error("Error fetching market trend:", err)
      updateSequentialTaskStatus('marketTrend', 'error', 'Failed to fetch market trend')
      return false
    } finally {
      updateLoadingState('marketTrend', false)
    }
  }, [apiKey, blockchain, metric, timeRange])

  // ---------------- Fetch traders ----------------
  const fetchTraders = useCallback(async () => {
    if (!apiKey) return false

    const cacheKey = getCacheKey('traders', { blockchain: blockchainString, timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setTradersData(cached)
      updateSequentialTaskStatus('traders', 'success', 'Traders data loaded from cache')
      return true
    }

    updateSequentialTaskStatus('traders', 'loading', 'Fetching traders insights…')
    updateLoadingState('traders', true)

    try {
      const res = await axios.get('https://api.unleashnfts.com/api/v2/nft/market-insights/traders', {
        params: { blockchain: blockchainString, time_range: timeRange },
        headers: { accept: 'application/json', 'x-api-key': apiKey },
      })

      const raw = res.data.data[0]
      const tradersData: TradersData = {
        block_dates: parseBraceArray<string>(raw.block_dates).map(d => format(new Date(d), 'MMM dd, yyyy HH:mm')),
        traders_trend: parseBraceArray<number>(raw.traders_trend),
        traders_buyers_trend: parseBraceArray<number>(raw.traders_buyers_trend),
        traders_sellers_trend: parseBraceArray<number>(raw.traders_sellers_trend),
      }

      setTradersData(tradersData)
      setCachedData(cacheKey, tradersData, CACHE_DURATION.TRADERS)
      updateSequentialTaskStatus('traders', 'success', 'Traders data loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching traders:', err)
      updateSequentialTaskStatus('traders', 'error', 'Failed to fetch traders data')
      return false
    } finally {
      updateLoadingState('traders', false)
    }
  }, [apiKey, blockchainString, timeRange])

  // Fetch washtrade trend with cache
  const fetchWashtrade = useCallback(async () => {
    if (!apiKey) return false

    const cacheKey = getCacheKey('washtrade', { blockchain: blockchainString, timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setWashtradeData(cached)
      updateSequentialTaskStatus('washtrade', 'success', 'Washtrade data loaded from cache')
      return true
    }

    updateSequentialTaskStatus('washtrade', 'loading', 'Analyzing washtrade patterns…')
    updateLoadingState('washtrade', true)

    try {
      const res = await axios.get('https://api.unleashnfts.com/api/v2/nft/market-insights/washtrade', {
        params: { blockchain: blockchainString, time_range: timeRange },
        headers: { accept: 'application/json', 'x-api-key': apiKey },
      })

      const raw = res.data.data[0]
      const washData: WashtradeData = {
        block_dates: parseBraceArray<string>(raw.block_dates).map(d => format(new Date(d), 'MMM dd, yyyy HH:mm')),
        washtrade_assets_trend: parseBraceArray<number>(raw.washtrade_assets_trend),
        washtrade_suspect_sales_trend: parseBraceArray<number>(raw.washtrade_suspect_sales_trend),
        washtrade_volume_trend: parseBraceArray<number>(raw.washtrade_volume_trend),
      }

      setWashtradeData(washData)
      setCachedData(cacheKey, washData, CACHE_DURATION.WASHTRADE)
      updateSequentialTaskStatus('washtrade', 'success', 'Washtrade data loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching washtrade:', err)
      updateSequentialTaskStatus('washtrade', 'error', 'Failed to fetch washtrade data')
      return false
    } finally {
      updateLoadingState('washtrade', false)
    }
  }, [apiKey, blockchainString, timeRange])

  // Sequential fetch all data
  const sequentialFetchAllData = useCallback(async () => {
    if (!apiKey) return

    setIsSequentialLoading(true)
    initializeSequentialTasks()

    // Add a small delay between requests to prevent rate limiting
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    try {
      // Fetch blockchains first
      await fetchBlockchains()
      await delay(500) // 500ms delay

      // Fetch market trend
      await fetchMarketTrend()
      await delay(500) // 500ms delay

      // Fetch traders
      await fetchTraders()
      await delay(500) // 500ms delay

      // Fetch washtrade
      await fetchWashtrade()
      
    } catch (error) {
      console.error('Error in sequential fetch:', error)
      setError('Failed to complete all data fetching operations')
    } finally {
      setIsSequentialLoading(false)
      // Clear tasks after 3 seconds if all completed
      setTimeout(() => {
        setSequentialTasks([])
      }, 3000)
    }
  }, [apiKey, fetchBlockchains, fetchMarketTrend, fetchTraders, fetchWashtrade])

  // Fetch NFT price estimates sequentially
  const fetchNftPriceEstimates = useCallback(async () => {
    if (!apiKey || !nftDetails) return

    const nftCacheKey = getCacheKey('nft_price', nftDetails)
    const collectionCacheKey = getCacheKey('collection_price', {
      blockchain: nftDetails.blockchain,
      contractAddress: nftDetails.contractAddress
    })

    const cachedNft = getCachedData(nftCacheKey)
    const cachedCollection = getCachedData(collectionCacheKey)

    if (cachedNft && cachedCollection) {
      setPriceEstimate(cachedNft)
      setCollectionPriceEstimate(cachedCollection)
      return
    }

    // Sequential NFT price fetching
    updateLoadingState('nftPrice', true)
    try {
      const nftResponse = await axios.get("https://api.unleashnfts.com/api/v2/nft/liquify/price_estimate", {
        params: {
          blockchain: nftDetails.blockchain,
          contract_address: nftDetails.contractAddress,
          token_id: nftDetails.tokenId,
        },
        headers: { "x-api-key": apiKey },
      })

      const nftPriceData = Array.isArray(nftResponse.data.data) ? nftResponse.data.data[0] : nftResponse.data.data
      setPriceEstimate(nftPriceData)
      setCachedData(nftCacheKey, nftPriceData, CACHE_DURATION.NFT_PRICE)
      
      updateLoadingState('nftPrice', false)
      
      // Add delay before next request
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Now fetch collection price
      updateLoadingState('collectionPrice', true)
      const collectionResponse = await axios.get("https://api.unleashnfts.com/api/v2/nft/liquify/collection/price_estimate", {
        params: {
          blockchain: nftDetails.blockchain,
          contract_address: nftDetails.contractAddress,
        },
        headers: { "x-api-key": apiKey },
      })

      const collectionPriceData = collectionResponse.data.data
      setCollectionPriceEstimate(collectionPriceData)
      setCachedData(collectionCacheKey, collectionPriceData, CACHE_DURATION.COLLECTION_PRICE)

    } catch (error) {
      console.error("Error fetching price estimate:", error)
      setError("Failed to fetch NFT price estimates")
    } finally {
      updateLoadingState('nftPrice', false)
      updateLoadingState('collectionPrice', false)
    }
  }, [apiKey, nftDetails])

  useEffect(() => {
    if (apiKey) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        sequentialFetchAllData()
      }, 300) // 300ms debounce
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [apiKey, blockchain, metric, timeRange, sequentialFetchAllData])

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
      <h3 className="font-black text-sm md:text-base mb-2 md:mb-3">Sequential Loading Progress</h3>
      <div className="space-y-2 md:space-y-3">
        {sequentialTasks.map((task, index) => (
          <div key={index} className="flex items-center space-x-2 md:space-x-3">
            {task.status === 'loading' && <LoaderCircle className="h-4 w-4 md:h-5 md:w-5 animate-spin text-blue-600" />}
            {task.status === 'success' && <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600" />}
            {task.status === 'error' && <XCircle className="h-4 w-4 md:h-5 md:w-5 text-red-600" />}
            <span className="text-xs md:text-sm font-bold">{task.name}:</span>
            <span className="text-xs md:text-sm">{task.message}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (!apiKey) {
    return (
      <div className="w-full min-h-screen bg-[#f5f5f5] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 bg-white p-6 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-xl md:text-2xl font-black text-center mb-6 uppercase">NFT Analytics API Key Required</h2>
          <Input
            type="text"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={handleApiKeyChange}
            className="bg-yellow-100 border-4 border-black placeholder:text-gray-700 p-3 md:p-4 text-base md:text-lg font-bold hover:bg-yellow-200 transition-all"
          />
          <p className="text-sm md:text-base font-bold text-center p-3 md:p-4 bg-pink-200 border-4 border-black">Please enter your API key to access NFT analytics data</p>
        </div>
      </div>
    )
  }

  return (
  <div className="w-full min-h-screen bg-purple-400 overflow-hidden flex flex-col p-4">
    {error && (
      <div className="p-3 md:p-4 bg-red-100 border-4 border-black text-black font-bold mb-4 text-sm md:text-base">
        {error}
        <button
          onClick={() => setError(null)}
          className="ml-2 text-red-600 hover:text-red-800"
        >
          ✕
        </button>
      </div>
    )}

    {/* Sequential progress indicator */}
    {(isSequentialLoading || sequentialTasks.length > 0) && <SequentialProgressIndicator />}

    {/* Individual loading indicators for NFT operations */}
    {(loadingStates.nftPrice || loadingStates.collectionPrice) && (
      <div className="bg-blue-100 border-4 border-black p-2 mb-4">
        <div className="space-y-1">
          {loadingStates.nftPrice && <LoadingIndicator message="Estimating NFT price..." />}
          {loadingStates.collectionPrice && <LoadingIndicator message="Analyzing collection prices..." />}
        </div>
      </div>
    )}

    <div className="z-50 relative">
      <div className="w-full bg-white p-4 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <Select value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <SelectTrigger className="w-full h-12 text-sm bg-white font-black uppercase border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all">
          <SelectValue>
            <span>
              {{
                'nft-details': 'NFT Details',
                'wallet-analysis': 'Wallet Analysis',
                'nft-transaction': 'NFT Transaction',
                'nft-traders': 'NFT Traders',
                'trends': 'Broad Analysis',
                "nft-analytics": 'Nft Analysis'
              }[activeTab]}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="border-4 border-black bg-white text-black max-h-60 overflow-y-auto">
          <SelectGroup>
            <SelectItem value="nft-details" className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer">NFT Details</SelectItem>
            <SelectItem value="wallet-analysis" className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer">Wallet Analysis</SelectItem>
            <SelectItem value="nft-transaction" className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer">NFT Transaction</SelectItem>
            <SelectItem value="nft-traders" className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer">NFT Traders</SelectItem>
            <SelectItem value="nft-analytics" className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer">NFT Analytics</SelectItem>
            <SelectItem value="trends" className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer">Broad Analysis</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      </div>
    </div>

    <Filters
      blockchain={blockchain}
      setBlockchain={setBlockchain}
      optionBlockchain={optionBlockchain}
      setBlockchainString={setBlockchainString}
      metric={metric}
      setMetric={setMetric}
      metricsData={metricsData}
      timeRange={timeRange}
      setTimeRange={setTimeRange}
    />

    {isSequentialLoading && activeTab === "trends" ? (
      <div className="flex justify-center items-center h-64">
        <LoadingIndicator message="Loading trend analysis sequentially..." />
      </div>
    ) : (
      <div className="flex gap-2 md:gap-4 mt-0 justify-center items-start">
        {activeTab === "trends" && (
          <div className="flex flex-col item-center justify-center gap-2 sm:gap-4 md:gap-8 pb-4 w-full">
            {/* ─── AI Copilot for Trends ───────────────────────── */}
            <div className="w-full">
              {!chat.isOpen && (
                <Button
                  onClick={()=>setChat(p=>({...p,isOpen:true}))}
                  disabled={!trendsReady}
                  className={`w-full font-bold py-3 px-4 border-4 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 ${
                    trendsReady?"bg-gradient-to-r from-purple-200 to-pink-200 hover:from-purple-300 hover:to-pink-300":"bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}>
                  <Bot className="h-5 w-5"/> Ask AI Copilot…
                </Button>
              )}

              {chat.isOpen && (
                <Card className="border-4 border-black bg-white shadow-[8px_8px_0_0_rgba(0,0,0,1)] mb-4">
                  {/* Header */}
                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-200 to-pink-200 border-b-4 border-black">
                    <div className="flex items-center gap-2"><Bot className="h-5 w-5"/><span className="font-black text-sm">AI Copilot</span></div>
                    <div className="flex items-center gap-2">
                      <Button onClick={()=>setChat(p=>({...p,isMin:!p.isMin}))} size="sm" variant="ghost"
                        className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        {chat.isMin?<Maximize2 className="h-4 w-4"/>:<Minimize2 className="h-4 w-4"/>}
                      </Button>
                      <Button onClick={()=>setChat({messages:[],isOpen:false,isMin:false,isStreaming:false})} size="sm" variant="ghost"
                        className="p-1 bg-black/10 border-2 border-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]"><X className="h-4 w-4"/></Button>
                    </div>
                  </div>

                  {!chat.isMin && (
                    <>
                      {/* Key prompt */}
                      {!openaiApiKey&&(
                        <div className="p-3 bg-yellow-100 border-b-4 border-black">
                          <label className="text-xs font-bold text-gray-700">OpenAI API Key Required:</label>
                          <input type="password" placeholder="Enter your OpenAI API key"
                            className="mt-2 w-full text-xs p-2 border-4 border-black font-bold shadow-[2px_2px_0_0_rgba(0,0,0,1)]"
                            onChange={e=>setOpenaiApiKey(e.target.value)}/>
                          <p className="text-xs text-gray-600 font-bold mt-1">Key is stored locally, never sent to server.</p>
                        </div>
                      )}

                      {/* Transcript */}
                      <div ref={chatScrollRef} className="h-64 overflow-y-auto p-3 space-y-3 bg-gray-50 border-b-4 border-black">
                        {chat.messages.length===0&&(
                          <div className="text-center text-gray-500 text-sm p-4 border-4 border-gray-300 bg-white shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
                            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50"/>
                            <p className="font-black">Ask me anything about these trends!</p>
                            <p className="text-xs mt-1 font-bold">Try: "Show pie of washtrade volume"</p>
                          </div>
                        )}
                        {chat.messages.map(m=>{
                          const hasChart=m.content.includes("```chart")
                          const width=hasChart?"w-full max-w-none":"max-w-xs lg:max-w-md"
                          return(
                            <div key={m.id} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                              <div className={`${width} px-4 py-3 border-4 border-black font-bold text-sm shadow-[4px_4px_0_0_rgba(0,0,0,1)] ${
                                  m.role==="user"?"bg-blue-200 text-blue-900":"bg-white text-gray-800"}`}>
                                <MsgContent content={m.content}/>
                                <div className="text-xs opacity-70 mt-2 font-bold">{m.timestamp.toLocaleTimeString()}</div>
                              </div>
                            </div>
                          )
                        })}
                        {chat.isStreaming&&(
                          <div className="flex justify-start">
                            <div className="bg-white border-4 border-black px-4 py-3 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
                              <div className="flex items-center space-x-1">
                                <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black"></div>
                                <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black" style={{animationDelay:"0.1s"}}></div>
                                <div className="w-3 h-3 bg-gray-400 rounded-full animate-bounce border-2 border-black" style={{animationDelay:"0.2s"}}></div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Input */}
                      {openaiApiKey&&(
                        <form onSubmit={submitChat} className="p-3 bg-white">
                          <div className="flex flex-col md:flex-row gap-2">
                            <input ref={chatInputRef}
                              placeholder="Ask about these charts…" disabled={chat.isStreaming}
                              className="flex-grow text-sm p-3 bg-white border-4 border-black font-bold shadow-[2px_2px_0_0_rgba(0,0,0,1)] focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] outline-none"/>
                            <Button type="submit" disabled={chat.isStreaming}
                              className="flex-shrink-0 md:w-14 bg-purple-200 hover:bg-purple-300 border-4 border-black font-bold shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] disabled:opacity-50 grid place-content-center">
                              <Send className="h-5 w-5"/>
                            </Button>
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </Card>
              )}
            </div>
            <Card className="bg-white border-2 sm:border-4 w-full max-w-full sm:max-w-4xl h-auto border-black p-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all">
              <CardHeader className="p-2 sm:p-4">
                <CardTitle className="text-base sm:text-xl text-center font-black uppercase bg-orange-200 p-1 sm:p-2 border-2 sm:border-4 border-black inline-block">
                  General Market Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                <div className="">
                  {loadingStates.marketTrend ? (
                    <LoadingIndicator message="Loading market data..." />
                  ) : (
                    <Chart data={data} metric={metric} />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-2 sm:border-4 w-full max-w-full sm:max-w-4xl h-auto border-black p-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all">
              <CardHeader className="p-2 sm:p-4">
                <CardTitle className="text-base sm:text-xl text-center font-black uppercase bg-orange-200 p-1 sm:p-2 border-2 sm:border-4 border-black inline-block">
                  Traders Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                <div className="">
                  {loadingStates.traders ? (
                    <LoadingIndicator message="Loading traders data..." />
                  ) : (
                    <Chart
                      data={Tradersdata?.block_dates.map((date, index) => ({
                        timestamp: date,
                        traders: Tradersdata.traders_trend[index],
                        buyers: Tradersdata.traders_buyers_trend[index],
                        sellers: Tradersdata.traders_sellers_trend[index],
                      }))}
                      showTraders={true}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-2 sm:border-4 w-full max-w-full sm:max-w-4xl h-auto border-black p-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all">
              <CardHeader className="p-2 sm:p-4">
                <CardTitle className="text-base sm:text-xl text-center font-black uppercase bg-orange-200 p-1 sm:p-2 border-2 sm:border-4 border-black inline-block">
                  Washtrade Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                <div className="">
                  {loadingStates.washtrade ? (
                    <LoadingIndicator message="Loading washtrade data..." />
                  ) : (
                    <Chart
                      data={washtradeData?.block_dates.map((date, index) => ({
                        timestamp: date,
                        washtrade_volume: Number.parseFloat(washtradeData.washtrade_volume_trend[index].toFixed(2)),
                        washtrade_assets: Number.parseFloat(washtradeData.washtrade_assets_trend[index].toFixed(2)),
                        washtrade_suspect_sales: Number.parseFloat(
                          washtradeData.washtrade_suspect_sales_trend[index].toFixed(2),
                        ),
                      }))}
                      showWashtrade={true}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {activeTab === "wallet-analysis" && (
          <Card className="bg-white space-y-4 border-4 border-black p-3 md:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
            <CardHeader className="text-center">
              <CardTitle className="text-lg text-center md:text-xl font-black uppercase bg-orange-200 p-2 md:p-4 border-4 border-black inline-block">Wallet Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <WalletAnalysis
                apiKey={apiKey}
                tabInfo={tabInfo}
                isSidepanel={isSidepanel}
                refreshTabInfo={refreshTabInfo}
                tabLoading={tabLoading}
                timeRange={timeRange}
              />
            </CardContent>
          </Card>
        )}
        {activeTab === "nft-details" && (
          <Card className="bg-white border-4 space-y-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all min-w-0 max-w-full">
            <CardHeader className="min-w-0">
              <CardTitle className="text-lg text-center md:text-xl font-black uppercase bg-orange-200 p-2 md:p-4 border-4 border-black inline-block min-w-0 break-words">
                NFT Details
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              <div className="space-y-3 md:space-y-4 min-w-0">
                <Separator className="bg-black"/>
                {isSidepanel && (
                  <div className="bg-blue-100 flex flex-col gap-4 p-3 border-4 border-black min-w-0">
                    <div className="flex items-center justify-between min-w-0 gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs md:text-sm font-bold truncate">
                          Current Page: {tabInfo?.title || 'Loading...'}
                        </p>
                        <p className="text-xs text-gray-600 truncate min-w-0">
                          {tabInfo?.url || ''}
                        </p>
                      </div>
                      <Button
                        onClick={refreshTabInfo}
                        disabled={tabLoading}
                        size="sm"
                        variant="outline"
                        className="border-2 rounded-none border-black flex-shrink-0"
                      >
                        <RefreshCw className={`h-4 w-4 ${tabLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => {
                    if (isSidepanel && tabInfo?.nftDetails) {
                      setNftDetails(tabInfo.nftDetails);
                      setError(null);
                    } else {
                      if (typeof chrome !== 'undefined' && chrome.runtime) {
                        chrome.runtime.sendMessage({ type: 'GET_NFT_DETAILS' }, (response: any) => {
                          if (response?.nftDetails) {
                            setNftDetails(response.nftDetails);
                            setError(null);
                          } else {
                            setError('Unable to extract NFT details. Please make sure you are on an OpenSea NFT page.');
                            setNftDetails(null);
                          }
                        });
                      }
                    }
                  }}
                  className="w-full bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all text-sm md:text-base min-w-0 break-words"
                >
                  {isSidepanel ? 'Use Current Page NFT' : 'Extract NFT Details'}
                </button>
                
                {nftDetails && (
                  <div className="space-y-3 md:space-y-4 min-w-0">
                    <div className="space-y-2 bg-yellow-100 p-3 md:p-4 border-4 border-black min-w-0">
                      <p className="text-xs md:text-sm font-bold min-w-0">
                        Blockchain: <span className="text-blue-600 break-words">{nftDetails.blockchain}</span>
                      </p>
                      <p className="text-xs md:text-sm font-bold min-w-0">
                        Contract Address: <span className="text-blue-600 break-all font-mono text-xs">{nftDetails.contractAddress}</span>
                      </p>
                      <p className="text-xs md:text-sm font-bold min-w-0">
                        Token ID: <span className="text-blue-600 break-words">{nftDetails.tokenId}</span>
                      </p>
                    </div>

                    <Separator className="bg-black"/>
                    
                    <button
                      onClick={fetchNftPriceEstimates}
                      disabled={loadingStates.nftPrice || loadingStates.collectionPrice}
                      className="w-full bg-green-200 hover:bg-green-300 disabled:bg-gray-200 disabled:cursor-not-allowed text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center text-sm md:text-base min-w-0"
                    >
                      {loadingStates.nftPrice || loadingStates.collectionPrice ? (
                        <div className="flex items-center min-w-0">
                          <LoaderCircle className="h-4 w-4 animate-spin mr-2 flex-shrink-0" />
                          <span className="text-xs md:text-sm truncate">
                            {loadingStates.nftPrice ? 'Analyzing NFT...' : 'Analyzing Collection...'}
                          </span>
                        </div>
                      ) : (
                        'Analyze NFT Price'
                      )}
                    </button>
                    
                    <NftPriceCard data={priceEstimate} />
                    <NftCollectionPriceCard data={collectionPriceEstimate} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        {activeTab === "nft-transaction" && (
          <Card className="bg-white space-y-4 border-4 border-black p-3 md:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
            <CardHeader className="text-center">
              <CardTitle className="text-lg text-center md:text-xl font-black uppercase bg-orange-200 p-2 md:p-4 border-4 border-black inline-block">NFT Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    if (isSidepanel && tabInfo?.nftDetails) {
                      setNftDetails(tabInfo.nftDetails);
                    } else {
                      // Fallback for popup mode
                      if (typeof chrome !== 'undefined' && chrome.runtime) {
                        chrome.runtime.sendMessage({ type: 'GET_NFT_DETAILS' }, (response: any) => {
                          if (response.nftDetails) {
                            setNftDetails(response.nftDetails);
                          }
                        });
                      }
                    }
                  }}
                  className="w-full bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all text-sm md:text-base"
                >
                  {isSidepanel ? 'Use Current Page NFT' : 'Extract NFT Details'}
                </button>
                {nftDetails && (
                  <div className="space-y-3 md:space-y-4">
                    <div className="space-y-2 bg-yellow-100 p-3 md:p-4 border-4 border-black">
                      <p className="text-xs md:text-sm font-bold">Blockchain: <span className="text-blue-600">{nftDetails.blockchain}</span></p>
                      <p className="text-xs md:text-sm font-bold">Contract Address: <span className="text-blue-600 break-all">{nftDetails.contractAddress}</span></p>
                      <p className="text-xs md:text-sm font-bold">Token ID: <span className="text-blue-600">{nftDetails.tokenId}</span></p>
                    </div>
                    <NftTransaction
                      blockchain={nftDetails.blockchain}
                      contractAddress={nftDetails.contractAddress}
                      tokenId={nftDetails.tokenId}
                      timeRange={timeRange}
                      setTimeRange={setTimeRange}
                      apiKey={apiKey}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        {activeTab === "nft-traders" && (
          <Card className="bg-white space-y-4 border-4 border-black p-3 md:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
            <CardHeader className="text-center">
              <CardTitle className="text-lg text-center md:text-xl font-black uppercase bg-orange-200 p-2 md:p-4 border-4 border-black inline-block">NFT Traders Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    if (isSidepanel && tabInfo?.nftDetails) {
                      setNftDetails(tabInfo.nftDetails);
                    } else {
                      // Fallback for popup mode
                      if (typeof chrome !== 'undefined' && chrome.runtime) {
                        chrome.runtime.sendMessage({ type: 'GET_NFT_DETAILS' }, (response: any) => {
                          if (response.nftDetails) {
                            setNftDetails(response.nftDetails);
                          }
                        });
                      }
                    }
                  }}
                  className="w-full bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all text-sm md:text-base"
                >
                  {isSidepanel ? 'Use Current Page NFT' : 'Extract NFT Details'}
                </button>
                {nftDetails && (
                  <div className="space-y-3 md:space-y-4">
                    <div className="space-y-2 bg-yellow-100 p-3 md:p-4 border-4 border-black">
                      <p className="text-xs md:text-sm font-bold">Blockchain: <span className="text-blue-600">{nftDetails.blockchain}</span></p>
                      <p className="text-xs md:text-sm font-bold">Contract Address: <span className="text-blue-600 break-all">{nftDetails.contractAddress}</span></p>
                      <p className="text-xs md:text-sm font-bold">Token ID: <span className="text-blue-600">{nftDetails.tokenId}</span></p>
                    </div>
                    <NftTraders
                      blockchain={nftDetails.blockchain}
                      contractAddress={nftDetails.contractAddress}
                      tokenId={nftDetails.tokenId}
                      timeRange={timeRange}
                      apiKey={apiKey}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        {activeTab === "nft-analytics" && (
          <Card className="bg-white space-y-4 border-4 border-black p-3 md:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
            <CardHeader className="text-center">
              <CardTitle className="text-lg text-center md:text-xl font-black uppercase bg-orange-200 p-2 md:p-4 border-4 border-black inline-block">NFT Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    if (isSidepanel && tabInfo?.nftDetails) {
                      setNftDetails(tabInfo.nftDetails);
                    } else {
                      // Fallback for popup mode
                      if (typeof chrome !== 'undefined' && chrome.runtime) {
                        chrome.runtime.sendMessage({ type: 'GET_NFT_DETAILS' }, (response: any) => {
                          if (response.nftDetails) {
                            setNftDetails(response.nftDetails);
                          }
                        });
                      }
                    }
                  }}
                  className="w-full bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all text-sm md:text-base"
                >
                  {isSidepanel ? 'Use Current Page NFT' : 'Extract NFT Details'}
                </button>
                {nftDetails && (
                  <div className="space-y-3 md:space-y-4">
                    <div className="space-y-2 bg-yellow-100 p-3 md:p-4 border-4 border-black">
                      <p className="text-xs md:text-sm font-bold">Blockchain: <span className="text-blue-600">{nftDetails.blockchain}</span></p>
                      <p className="text-xs md:text-sm font-bold">Contract Address: <span className="text-blue-600 break-all">{nftDetails.contractAddress}</span></p>
                      <p className="text-xs md:text-sm font-bold">Token ID: <span className="text-blue-600">{nftDetails.tokenId}</span></p>
                    </div>
                    <NftAnalytics
                      blockchain={nftDetails.blockchain}
                      contractAddress={nftDetails.contractAddress}
                      tokenId={nftDetails.tokenId}
                      timeRange={timeRange}
                      apiKey={apiKey}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )}
    </div>
  )
}

export default App