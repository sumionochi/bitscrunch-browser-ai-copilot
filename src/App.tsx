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
  const [activeTab, setActiveTab] = useState<"nft-details" | "nft-transaction" | "nft-traders" | "nft-analytics" | "trends">("nft-details")
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
  <div className="w-full min-h-screen bg-rose-400 overflow-hidden flex flex-col p-4">
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
          <div className="flex flex-col gap-4 md:gap-8 pb-4 w-full">
            <Card className="bg-white border-4 w-full max-w-4xl h-auto min-h-[20rem] md:min-h-[28rem] border-black p-0 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
              <CardHeader>
                <CardTitle className="text-xl text-center font-black uppercase bg-orange-200 p-2 border-4 border-black inline-block">General Market Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-68 md:h-64 lg:h-80">
                  {loadingStates.marketTrend ? (
                    <LoadingIndicator message="Loading market data..." />
                  ) : (
                    <Chart data={data} metric={metric} />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-4 w-[40rem] h-[28rem] border-black p-0 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
              <CardHeader>
                <CardTitle className="text-xl text-center font-black uppercase bg-orange-200 p-2 border-4 border-black inline-block">Traders Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-68 md:h-64 lg:h-80">
                  {loadingStates.traders ? (
                    <LoadingIndicator message="Loading traders data..." />
                  ) : (
                    <Chart data={Tradersdata?.block_dates.map((date, index) => ({
                      timestamp: date,
                      traders: Tradersdata.traders_trend[index],
                      buyers: Tradersdata.traders_buyers_trend[index],
                      sellers: Tradersdata.traders_sellers_trend[index]
                    }))} showTraders={true} />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-4 w-[40rem] h-[32rem] border-black p-0 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all">
              <CardHeader>
                <CardTitle className="text-xl text-center font-black uppercase bg-orange-200 p-2 border-4 border-black inline-block">Washtrade Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-68 md:h-64 lg:h-80">
                  {loadingStates.washtrade ? (
                    <LoadingIndicator message="Loading washtrade data..." />
                  ) : (
                    <Chart data={washtradeData?.block_dates.map((date, index) => ({
                      timestamp: date,
                      washtrade_volume: parseFloat(washtradeData.washtrade_volume_trend[index].toFixed(2)),
                      washtrade_assets: parseFloat(washtradeData.washtrade_assets_trend[index].toFixed(2)),
                      washtrade_suspect_sales: parseFloat(washtradeData.washtrade_suspect_sales_trend[index].toFixed(2))
                    }))} showWashtrade={true} />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
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