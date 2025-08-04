import React, { useState, useCallback, useRef, useEffect } from 'react'
import axios from 'axios'
import { LoaderCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

interface WalletInfo {
  address: string;
  blockchain: string;
}

interface CacheData {
  data: any;
  timestamp: number;
  expiresIn: number;
}

interface SequentialTaskStatus {
  name: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  message: string;
}

interface LoadingState {
  defiBalance: boolean;
  nftBalance: boolean;
  tokenBalance: boolean;
  walletLabel: boolean;
  nftProfile: boolean;
  walletScore: boolean;
  walletMetrics: boolean;
  nftAnalytics: boolean;
  nftScores: boolean;
  nftTraders: boolean;
  nftWashtrade: boolean;
}

interface WalletAnalysisProps {
  apiKey: string;
  tabInfo?: any;
  isSidepanel?: boolean;
  refreshTabInfo?: () => void;
  tabLoading?: boolean;
  timeRange: string;
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
};

const WalletAnalysis: React.FC<WalletAnalysisProps> = ({
  apiKey,
  tabInfo,
  isSidepanel = false,
  refreshTabInfo,
  tabLoading = false,
  timeRange
}) => {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSequentialLoading, setIsSequentialLoading] = useState(false)
  const [sequentialTasks, setSequentialTasks] = useState<SequentialTaskStatus[]>([])
  
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
const [labelChain, setLabelChain] = useState<string>('ethereum');

const BLOCKCHAIN_OPTIONS = [
  'avalanche',
  'bitcoin',
  'binance',
  'ethereum',
  'linea',
  'polygon',
  'solana',
];

  // Cache storage
  const cacheRef = useRef<{ [key: string]: CacheData }>({})

  // Extract wallet address from OpenSea URL
  const extractWalletFromUrl = (url: string): WalletInfo | null => {
    try {
      // Pattern for OpenSea wallet URLs: https://opensea.io/0x...
      const walletMatch = url.match(/opensea\.io\/([^\/\?]+)/)
      
      if (walletMatch && walletMatch[1]) {
        const address = walletMatch[1]
        // Check if it's a valid Ethereum address (starts with 0x and is 42 characters)
        if (address.startsWith('0x') && address.length === 42) {
          return {
            address: address,
            blockchain: 'ethereum' // Default to ethereum, can be made configurable
          }
        }
      }
      return null
    } catch (error) {
      console.error('Error extracting wallet from URL:', error)
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
      { name: 'nftBalance', status: 'pending', message: 'Waiting to load NFT balance...' },
      { name: 'tokenBalance', status: 'pending', message: 'Waiting to load token balance...' },
      { name: 'walletLabel', status: 'pending', message: 'Waiting to load wallet label...' },
      { name: 'walletScore', status: 'pending', message: 'Waiting to load wallet score...' },
      { name: 'walletMetrics', status: 'pending', message: 'Waiting to load wallet metrics...' },
      { name: 'nftAnalytics', status: 'pending', message: 'Waiting to load NFT analytics...' },
      { name: 'nftTraders', status: 'pending', message: 'Waiting to load NFT traders...' },
    ])
  }

  // Individual API fetch functions
  const fetchNftBalance = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey('nft_balance', { wallet: walletInfo.address, blockchain: walletInfo.blockchain })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setNftBalance(cached)
      updateSequentialTaskStatus('nftBalance', 'success', 'NFT balance loaded from cache')
      return true
    }

    updateSequentialTaskStatus('nftBalance', 'loading', 'Fetching NFT balance...')
    updateLoadingState('nftBalance', true)

    try {
      const response = await axios.get('https://api.unleashnfts.com/api/v2/wallet/balance/nft', {
        params: {
          wallet: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: 'all',
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })

      setNftBalance(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.NFT_BALANCE)
      updateSequentialTaskStatus('nftBalance', 'success', 'NFT balance loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching NFT balance:', err)
      updateSequentialTaskStatus('nftBalance', 'error', 'Failed to fetch NFT balance')
      return false
    } finally {
      updateLoadingState('nftBalance', false)
    }
  }, [walletInfo, apiKey])

  const fetchTokenBalance = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey('token_balance', { address: walletInfo.address, blockchain: walletInfo.blockchain })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setTokenBalance(cached)
      updateSequentialTaskStatus('tokenBalance', 'success', 'Token balance loaded from cache')
      return true
    }

    updateSequentialTaskStatus('tokenBalance', 'loading', 'Fetching token balance...')
    updateLoadingState('tokenBalance', true)

    try {
      const response = await axios.get('https://api.unleashnfts.com/api/v2/wallet/balance/token', {
        params: {
          address: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: 'all',
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })

      setTokenBalance(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.TOKEN_BALANCE)
      updateSequentialTaskStatus('tokenBalance', 'success', 'Token balance loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching token balance:', err)
      updateSequentialTaskStatus('tokenBalance', 'error', 'Failed to fetch token balance')
      return false
    } finally {
      updateLoadingState('tokenBalance', false)
    }
  }, [walletInfo, apiKey])

  const fetchWalletLabel = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey('wallet_label', { address: walletInfo.address, blockchain: labelChain })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setWalletLabel(cached)
      updateSequentialTaskStatus('walletLabel', 'success', 'Wallet label loaded from cache')
      return true
    }

    updateSequentialTaskStatus('walletLabel', 'loading', 'Fetching wallet label...')
    updateLoadingState('walletLabel', true)

    try {
      const response = await axios.get('https://api.unleashnfts.com/api/v2/wallet/label', {
        params: {
          address: walletInfo.address,
          blockchain: labelChain,
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })

      setWalletLabel(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.WALLET_LABEL)
      updateSequentialTaskStatus('walletLabel', 'success', 'Wallet label loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching wallet label:', err)
      updateSequentialTaskStatus('walletLabel', 'error', 'Failed to fetch wallet label')
      return false
    } finally {
      updateLoadingState('walletLabel', false)
    }
  }, [walletInfo, apiKey])

  const fetchWalletScore = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey('wallet_score', { wallet_address: walletInfo.address, time_range: timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setWalletScore(cached)
      updateSequentialTaskStatus('walletScore', 'success', 'Wallet score loaded from cache')
      return true
    }

    updateSequentialTaskStatus('walletScore', 'loading', 'Fetching wallet score...')
    updateLoadingState('walletScore', true)

    try {
      const response = await axios.get('https://api.unleashnfts.com/api/v2/wallet/score', {
        params: {
          wallet_address: walletInfo.address,
          time_range: "all",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })

      setWalletScore(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.WALLET_SCORE)
      updateSequentialTaskStatus('walletScore', 'success', 'Wallet score loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching wallet score:', err)
      updateSequentialTaskStatus('walletScore', 'error', 'Failed to fetch wallet score')
      return false
    } finally {
      updateLoadingState('walletScore', false)
    }
  }, [walletInfo, apiKey, timeRange])

  const fetchWalletMetrics = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    // Check if blockchain is supported
    const supportedBlockchains = ["linea", "polygon", "ethereum", "avalanche"];
    if (!supportedBlockchains.includes(walletInfo.blockchain.toLowerCase())) {
      updateSequentialTaskStatus('walletMetrics', 'error', `Unsupported blockchain: ${walletInfo.blockchain}`)
      return false
    }

    const cacheKey = getCacheKey('wallet_metrics', { wallet: walletInfo.address, blockchain: walletInfo.blockchain, time_range: timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setWalletMetrics(cached)
      updateSequentialTaskStatus('walletMetrics', 'success', 'Wallet metrics loaded from cache')
      return true
    }

    updateSequentialTaskStatus('walletMetrics', 'loading', 'Fetching wallet metrics...')
    updateLoadingState('walletMetrics', true)

    try {
      const response = await axios.get('https://api.unleashnfts.com/api/v2/wallet/metrics', {
        params: {
          blockchain: walletInfo.blockchain.toLowerCase(),
          wallet: walletInfo.address,
          time_range: "all",
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })

      setWalletMetrics(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.WALLET_METRICS)
      updateSequentialTaskStatus('walletMetrics', 'success', 'Wallet metrics loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching wallet metrics:', err)
      updateSequentialTaskStatus('walletMetrics', 'error', 'Failed to fetch wallet metrics')
      return false
    } finally {
      updateLoadingState('walletMetrics', false)
    }
  }, [walletInfo, apiKey, timeRange])

  const fetchNftAnalytics = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey('nft_analytics', { wallet: walletInfo.address, blockchain: walletInfo.blockchain, time_range: timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setNftAnalytics(cached)
      updateSequentialTaskStatus('nftAnalytics', 'success', 'NFT analytics loaded from cache')
      return true
    }

    updateSequentialTaskStatus('nftAnalytics', 'loading', 'Fetching NFT analytics...')
    updateLoadingState('nftAnalytics', true)

    try {
      const response = await axios.get('https://api.unleashnfts.com/api/v2/nft/wallet/analytics', {
        params: {
          wallet: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: timeRange,
          sort_by: 'volume',
          sort_order: 'desc',
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })

      setNftAnalytics(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.NFT_ANALYTICS)
      updateSequentialTaskStatus('nftAnalytics', 'success', 'NFT analytics loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching NFT analytics:', err)
      updateSequentialTaskStatus('nftAnalytics', 'error', 'Failed to fetch NFT analytics')
      return false
    } finally {
      updateLoadingState('nftAnalytics', false)
    }
  }, [walletInfo, apiKey, timeRange])

  const fetchNftTraders = useCallback(async () => {
    if (!walletInfo || !apiKey) return false

    const cacheKey = getCacheKey('nft_traders', { wallet: walletInfo.address, blockchain: walletInfo.blockchain, time_range: timeRange })
    const cached = getCachedData(cacheKey)
    if (cached) {
      setNftTraders(cached)
      updateSequentialTaskStatus('nftTraders', 'success', 'NFT traders loaded from cache')
      return true
    }

    updateSequentialTaskStatus('nftTraders', 'loading', 'Fetching NFT traders...')
    updateLoadingState('nftTraders', true)

    try {
      const response = await axios.get('https://api.unleashnfts.com/api/v2/nft/wallet/traders', {
        params: {
          wallet: walletInfo.address,
          blockchain: walletInfo.blockchain,
          time_range: timeRange,
          sort_by: 'traders',
          sort_order: 'desc',
          offset: 0,
          limit: 30,
        },
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })

      setNftTraders(response.data)
      setCachedData(cacheKey, response.data, CACHE_DURATION.NFT_TRADERS)
      updateSequentialTaskStatus('nftTraders', 'success', 'NFT traders loaded successfully')
      return true
    } catch (err) {
      console.error('Error fetching NFT traders:', err)
      updateSequentialTaskStatus('nftTraders', 'error', 'Failed to fetch NFT traders')
      return false
    } finally {
      updateLoadingState('nftTraders', false)
    }
  }, [walletInfo, apiKey, timeRange])

  // Sequential fetch all wallet data
  const sequentialFetchAllWalletData = useCallback(async () => {
    if (!walletInfo || !apiKey) return

    setIsSequentialLoading(true)
    initializeSequentialTasks()

    // Add delay between requests to prevent rate limiting
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
      console.error('Error in sequential wallet fetch:', error)
      setError('Failed to complete wallet analysis')
    } finally {
      setIsSequentialLoading(false)
      // Clear tasks after 3 seconds if all completed
      setTimeout(() => {
        setSequentialTasks([])
      }, 3000)
    }
  }, [walletInfo, apiKey, fetchNftBalance, fetchTokenBalance, fetchWalletLabel, fetchWalletScore, fetchWalletMetrics, fetchNftAnalytics, fetchNftTraders])

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
      <h3 className="font-black text-sm md:text-base mb-2 md:mb-3">Wallet Analysis Progress</h3>
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

  // Format currency value
  const formatCurrency = (value: number | string, currency: string = 'USD') => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(numValue)) return 'N/A'
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue)
  }

  // Render data card
  const DataCard = ({ title, data, isLoading, bgColor = 'bg-white' }: { 
    title: string, 
    data: any, 
    isLoading: boolean,
    bgColor?: string 
  }) => (
    <Card className={`${bgColor} border-4 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all min-w-0`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm md:text-base font-black uppercase bg-orange-200 p-2 border-2 border-black inline-block text-center">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        {isLoading ? (
          <LoadingIndicator message={`Loading ${title.toLowerCase()}...`} />
        ) : data ? (
          <div className="space-y-2">
            {/* Custom rendering based on data type */}
            {title === 'DeFi Balance' && data.data && (
              <div className="space-y-2">
                {Array.isArray(data.data) && data.data.length > 0 ? (
                  data.data.slice(0, 5).map((item: any, index: number) => (
                    <div key={index} className="p-2 bg-gray-50 border-2 border-black text-xs">
                      <p><strong>Token:</strong> {item.token_name || 'Unknown'}</p>
                      <p><strong>Balance:</strong> {item.balance || '0'}</p>
                      <p><strong>Value:</strong> {formatCurrency(item.usd_value || 0)}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-600">No DeFi balance found</p>
                )}
              </div>
            )}
            
            {title === 'NFT Balance' && data.data && (
                <div className="space-y-2">
                    {Array.isArray(data.data) && data.data.length > 0 ? (
                    data.data.map((item: any, index: number) => (
                        <div
                        key={index}
                        className="p-3 bg-gray-50 border-2 border-black text-xs space-y-1"
                        >
                        <p><strong>Collection:</strong> {item.collection}</p>
                        <p><strong>Token ID:</strong> {item.token_id}</p>
                        <p><strong>Quantity:</strong> {item.quantity}</p>
                        <p><strong>Contract Addr:</strong> <span className="break-all">{item.contract_address}</span></p>
                        <p><strong>Contract Type:</strong> {item.contract_type}</p>
                        <p><strong>Blockchain:</strong> {item.blockchain}</p>
                        <p><strong>Chain ID:</strong> {item.chain_id}</p>
                        {/* `wallet` is redundant (same for every row) but included for completeness */}
                        <p><strong>Wallet:</strong> <span className="break-all">{item.wallet}</span></p>
                        </div>
                    ))
                    ) : (
                    <p className="text-sm text-gray-600">No NFTs found</p>
                    )}
                </div>
            )}
            
            {title === 'Token Balance' && data.data && (
            <div className="space-y-2">
                {Array.isArray(data.data) && data.data.length > 0 ? (
                data.data.map((item: any, index: number) => (
                    <div
                    key={index}
                    className="p-3 bg-gray-50 border-2 border-black text-xs space-y-1"
                    >
                    <p><strong>Token Name:</strong> {item.token_name || 'Unknown'}</p>
                    <p><strong>Symbol:</strong> {item.token_symbol}</p>
                    <p><strong>Quantity:</strong> {item.quantity}</p>
                    <p><strong>Decimals:</strong> {item.decimal}</p>
                    <p>
                        <strong>Token Address:</strong>{' '}
                        <span className="break-all">{item.token_address}</span>
                    </p>
                    <p><strong>Blockchain:</strong> {item.blockchain}</p>
                    <p><strong>Chain ID:</strong> {item.chain_id}</p>
                    </div>
                ))
                ) : (
                <p className="text-sm text-gray-600">No token balance found</p>
                )}
            </div>
            )}

            {title === 'Wallet Label' && data.data && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
                {Array.isArray(data.data) && data.data.length > 0 ? (
                data.data.map((item: any, idx: number) => {
                    // ❶ Pick every boolean flag that is true
                    // TRUE FLAGS
                    const trueFlags = Object.entries(item)
                    .filter(([_, value]) => typeof value === 'boolean' && value) // '_' signals “intentionally unused”
                    .map(([key]) => key.replace(/_/g, ' '));

                    // NAME FIELDS
                    const nameFields = Object.entries(item)
                    .filter(
                    ([key, value]) =>
                        key.endsWith('_name') &&
                        typeof value === 'string' &&
                        value.trim() !== '' &&
                        value !== '0',
                    )
                    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`);

                    return (
                    <div
                        key={idx}
                        className="p-3 bg-gray-50 border-2 border-black text-xs space-y-1"
                    >
                        <p>
                        <strong>Blockchain:</strong> {item.blockchain} (chain {item.chain_id})
                        </p>
                        <p>
                        <strong>Risk:</strong> category {item.risk_category} • depth{' '}
                        {item.risk_depth}
                        </p>
                        {trueFlags.length > 0 && (
                        <p>
                            <strong>Flags:</strong>{' '}
                            {trueFlags.join(', ').replace(/(^\w|\s\w)/g, (s) =>
                            s.toUpperCase()
                            )}
                        </p>
                        )}
                        {nameFields.length > 0 && (
                        <p>
                            <strong>Names:</strong> {nameFields.join(', ')}
                        </p>
                        )}
                        {trueFlags.length === 0 && nameFields.length === 0 && (
                        <p>No positive labels recorded.</p>
                        )}
                    </div>
                    );
                })
                ) : (
                <p className="text-sm text-gray-600">No labels found</p>
                )}
            </div>
            )}

            {title === 'NFT Profile' && data.data && (
              <div className="space-y-2">
                {data.data[0] && (
                  <div className="p-2 bg-gray-50 border-2 border-black text-xs">
                    <p><strong>Total Volume:</strong> {formatCurrency(data.data[0].total_volume || 0)}</p>
                    <p><strong>Total Sales:</strong> {data.data[0].total_sales || 0}</p>
                    <p><strong>Total Purchases:</strong> {data.data[0].total_purchases || 0}</p>
                    <p><strong>Unique Collections:</strong> {data.data[0].unique_collections || 0}</p>
                  </div>
                )}
              </div>
            )}

            {title === 'Wallet Score' && data.data && (
            <div className="space-y-2">
                {Array.isArray(data.data) && data.data.length > 0 ? (
                data.data.map((ws: any, idx: number) => (
                    <div
                    key={idx}
                    className="p-3 bg-gray-50 border-2 border-black text-xs space-y-1"
                    >
                    <p>
                        <strong>Overall Score:</strong>{' '}
                        {ws.wallet_score?.toFixed?.(2) ?? 'N/A'} &nbsp;
                        <span className="italic">({ws.classification})</span>
                    </p>

                    <Separator className="my-1 bg-black" />

                    <p><strong>Anomalous Pattern:</strong> {ws.anomalous_pattern_score}</p>
                    <p><strong>Associated Token:</strong> {ws.associated_token_score}</p>
                    <p><strong>Centralized Interaction:</strong> {ws.centralized_interaction_score}</p>
                    <p><strong>Frequency:</strong> {ws.frequency_score}</p>
                    <p><strong>Risk Interaction:</strong> {ws.risk_interaction_score}</p>
                    <p><strong>Smart-Contract Interaction:</strong> {ws.smart_contract_interaction_score}</p>
                    <p><strong>Staking/Governance:</strong> {ws.staking_governance_interaction_score}</p>
                    <p><strong>Volume:</strong> {ws.volume_score}</p>
                    <p><strong>Wallet Age:</strong> {ws.wallet_age_score}</p>

                    {ws.blockchain_with_illicit && (
                        <p className="text-red-600">
                        <strong>Illicit chains:</strong> {ws.blockchain_with_illicit}
                        </p>
                    )}
                    {ws.blockchain_without_illicit && (
                        <p>
                        <strong>Clean chains:</strong> {ws.blockchain_without_illicit}
                        </p>
                    )}
                    </div>
                ))
                ) : (
                <p className="text-sm text-gray-600">No wallet score data</p>
                )}
            </div>
            )}

            {title === 'Wallet Metrics' && data.data && (
            <div className="space-y-2">
                {Array.isArray(data.data) && data.data.length > 0 ? (
                data.data.map((m: any, idx: number) => (
                    <div
                    key={idx}
                    className="p-3 bg-gray-50 border-2 border-black text-xs space-y-1"
                    >
                    <p><strong>Wallet Age:</strong> {m.wallet_age} days</p>
                    <p><strong>Active Days:</strong> {m.wallet_active_days}</p>

                    <Separator className="my-1 bg-black" />

                    <p><strong>Total Txns:</strong> {m.total_txn}</p>
                    <p className="pl-3">↳ In / Out Txns: {m.in_txn} / {m.out_txn}</p>

                    <p><strong>Unique Inflow Addresses:</strong> {m.inflow_addresses}</p>
                    <p><strong>Unique Outflow Addresses:</strong> {m.outflow_addresses}</p>

                    <Separator className="my-1 bg-black" />

                    <p><strong>Volume (ETH / USD):</strong></p>
                    <p className="pl-3">
                        Inflow&nbsp;• {m.inflow_amount_eth.toFixed(4)} ETH / 
                        {formatCurrency(m.inflow_amount_usd)}
                    </p>
                    <p className="pl-3">
                        Outflow • {m.outflow_amount_eth.toFixed(4)} ETH / 
                        {formatCurrency(m.outflow_amount_usd)}
                    </p>
                    <p className="pl-3">
                        Total&nbsp;&nbsp;&nbsp;• {m.volume_eth.toFixed(4)} ETH / 
                        {formatCurrency(m.volume_usd)}
                    </p>

                    <Separator className="my-1 bg-black" />

                    <p><strong>Current Balance:</strong> {m.balance_eth.toFixed(4)} ETH / {formatCurrency(m.balance_usd)}</p>
                    <p><strong>Distinct Tokens Held:</strong> {m.token_cnt}</p>

                    <Separator className="my-1 bg-black" />

                    <p className="text-red-600">
                        Illicit Vol&nbsp;{m.illicit_volume} • Mixer Vol {m.mixer_volume} • Sanction Vol {m.sanction_volume}
                    </p>

                    <p><em>First active:</em> {new Date(m.first_active_day).toLocaleDateString()}</p>
                    <p><em>Last active:</em> {new Date(m.last_active_day).toLocaleDateString()}</p>
                    </div>
                ))
                ) : (
                <p className="text-sm text-gray-600">No wallet metrics data</p>
                )}
            </div>
            )}

            {title === 'NFT Analytics' && data.data && (
            <div className="space-y-2">
                {Array.isArray(data.data) && data.data.length > 0 ? (
                data.data.map((a: any, idx: number) => {
                    // helper to style % change
                    const pct = (val: number | null) =>
                    val === null
                        ? '—'
                        : `${(val * 100).toFixed(1)}%`;

                    const pctClass = (val: number | null) =>
                    val === null
                        ? ''
                        : val >= 0
                        ? 'text-green-600'
                        : 'text-red-600';

                    return (
                    <div
                        key={idx}
                        className="p-3 bg-gray-50 border-2 border-black text-xs space-y-1"
                    >
                        <p>
                        <strong>Blockchain:</strong> {a.blockchain} (chain {a.chain_id})
                        </p>

                        <Separator className="my-1 bg-black" />

                        <p>
                        <strong>Total Volume:</strong>{' '}
                        {formatCurrency(a.volume_eth ?? a.volume, 'USD')} &nbsp;
                        <span className={pctClass(a.volume_change)}>
                            ({pct(a.volume_change)})
                        </span>
                        </p>

                        <p className="pl-3">
                        Buy&nbsp;• {formatCurrency(a.buy_volume, 'USD')}
                        </p>
                        <p className="pl-3">
                        Sell&nbsp;• {formatCurrency(a.sell_volume, 'USD')}
                        </p>

                        <Separator className="my-1 bg-black" />

                        <p>
                        <strong>NFTs Bought:</strong> {a.nft_bought}{' '}
                        <span className={pctClass(a.nft_bought_change)}>
                            ({pct(a.nft_bought_change)})
                        </span>
                        </p>
                        <p>
                        <strong>NFTs Sold:</strong> {a.nft_sold}{' '}
                        <span className={pctClass(a.nft_sold_change)}>
                            ({pct(a.nft_sold_change)})
                        </span>
                        </p>
                        <p>
                        <strong>Transfers:</strong> {a.nft_transfer}{' '}
                        <span className={pctClass(a.nft_transfer_change)}>
                            ({pct(a.nft_transfer_change)})
                        </span>
                        </p>

                        {a.minted_value !== 0 && (
                        <p>
                            <strong>Minted Value:</strong>{' '}
                            {formatCurrency(a.minted_value, 'USD')}{' '}
                            <span className={pctClass(a.minted_value_change)}>
                            ({pct(a.minted_value_change)})
                            </span>
                        </p>
                        )}

                        <Separator className="my-1 bg-black" />

                        <p>
                        <strong>Sales Count:</strong> {a.sales}{' '}
                        <span className={pctClass(a.sales_change)}>
                            ({pct(a.sales_change)})
                        </span>
                        </p>
                        <p>
                        <strong>Transactions:</strong> {a.transactions}{' '}
                        <span className={pctClass(a.transactions_change)}>
                            ({pct(a.transactions_change)})
                        </span>
                        </p>

                        <p className="text-gray-600">
                        <em>Updated:</em>{' '}
                        {new Date(a.updated_at).toLocaleString()}
                        </p>
                    </div>
                    );
                })
                ) : (
                <p className="text-sm text-gray-600">No NFT analytics data</p>
                )}
            </div>
            )}

            {title === 'NFT Traders' && data.data && (
            <div className="space-y-2">
                {Array.isArray(data.data) && data.data.length > 0 ? (
                data.data.map((t: any, idx: number) => {
                    // helper: pct string + colour
                    const pct = (v: number | null) =>
                    v === null ? '—' : `${(v * 100).toFixed(1)}%`;
                    const pctCls = (v: number | null) =>
                    v === null
                        ? ''
                        : v >= 0
                        ? 'text-green-600'
                        : 'text-red-600';

                    return (
                    <div
                        key={idx}
                        className="p-3 bg-gray-50 border-2 border-black text-xs space-y-1"
                    >
                        <p>
                        <strong>Blockchain:</strong> {t.blockchain} (chain {t.chain_id})
                        </p>

                        <Separator className="my-1 bg-black" />

                        <p>
                        <strong>Total Traders:</strong> {t.traders}{' '}
                        <span className={pctCls(t.traders_change)}>
                            ({pct(t.traders_change)})
                        </span>
                        </p>
                        <p>
                        <strong>Buyers:</strong> {t.traders_buyers}{' '}
                        <span className={pctCls(t.traders_buyers_change)}>
                            ({pct(t.traders_buyers_change)})
                        </span>
                        </p>
                        <p>
                        <strong>Sellers:</strong> {t.traders_sellers}{' '}
                        <span className={pctCls(t.traders_sellers_change)}>
                            ({pct(t.traders_sellers_change)})
                        </span>
                        </p>

                        <p className="text-gray-600">
                        <em>Updated:</em>{' '}
                        {new Date(t.updated_at).toLocaleString()}
                        </p>
                    </div>
                    );
                })
                ) : (
                <p className="text-sm text-gray-600">No trader data</p>
                )}
            </div>
            )}

          </div>
        ) : (
          <p className="text-sm text-gray-600">No data available</p>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4 min-w-0 max-w-full">
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
            if (isSidepanel && tabInfo?.url) {
              const extractedWallet = extractWalletFromUrl(tabInfo.url)
              if (extractedWallet) {
                setWalletInfo(extractedWallet)
                setError(null)
              } else {
                setError('Unable to extract wallet address. Please make sure you are on an OpenSea wallet page.')
                setWalletInfo(null)
              }
            } else {
              if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({ type: 'GET_TAB_INFO' }, (response: any) => {
                  if (response?.url) {
                    const extractedWallet = extractWalletFromUrl(response.url)
                    if (extractedWallet) {
                      setWalletInfo(extractedWallet)
                      setError(null)
                    } else {
                      setError('Unable to extract wallet address. Please make sure you are on an OpenSea wallet page.')
                      setWalletInfo(null)
                    }
                  }
                })
              }
            }
          }}
          className="w-full bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-3 md:px-4 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all text-sm md:text-base min-w-0 break-words"
        >
          {isSidepanel ? 'Extract Wallet from Current Page' : 'Extract Wallet Address'}
        </button>
        
        {walletInfo && (
          <div className="space-y-3 md:space-y-4 min-w-0">
            <div className="space-y-2 bg-yellow-100 p-3 md:p-4 border-4 border-black min-w-0">
              <p className="text-xs md:text-sm font-bold min-w-0">
                Wallet Address: <span className="text-blue-600 break-all font-mono text-xs">{walletInfo.address}</span>
              </p>
              <p className="text-xs md:text-sm font-bold min-w-0">
                Blockchain: <span className="text-blue-600 break-words">{walletInfo.blockchain}</span>
              </p>
            </div>

            <Separator className="bg-black"/>

            <div className="flex items-center gap-2 mt-2">
            <span className="text-xs font-bold">Label on:</span>
            <select
                value={labelChain}
                onChange={(e) => setLabelChain(e.target.value)}
                className="border-2 border-black text-xs p-1 bg-white"
            >
                {BLOCKCHAIN_OPTIONS.map((opt) => (
                <option value={opt} key={opt}>
                    {opt}
                </option>
                ))}
            </select>
            </div>

            <Separator className="bg-black"/>
            
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
                'Analyze Wallet Address'
              )}
            </button>

            {/* Data Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">              
              <DataCard 
                title="NFT Balance" 
                data={nftBalance} 
                isLoading={loadingStates.nftBalance}
                bgColor="bg-purple-50"
              />
              
              <DataCard 
                title="Token Balance" 
                data={tokenBalance} 
                isLoading={loadingStates.tokenBalance}
                bgColor="bg-blue-50"
              />
              
              <DataCard 
                title="Wallet Label" 
                data={walletLabel} 
                isLoading={loadingStates.walletLabel}
                bgColor="bg-yellow-50"
              />
              
              <DataCard 
                title="Wallet Score" 
                data={walletScore} 
                isLoading={loadingStates.walletScore}
                bgColor="bg-indigo-50"
              />
              
              <DataCard 
                title="Wallet Metrics" 
                data={walletMetrics} 
                isLoading={loadingStates.walletMetrics}
                bgColor="bg-red-50"
              />
              
              <DataCard 
                title="NFT Analytics" 
                data={nftAnalytics} 
                isLoading={loadingStates.nftAnalytics}
                bgColor="bg-teal-50"
              />
              
              <DataCard 
                title="NFT Traders" 
                data={nftTraders} 
                isLoading={loadingStates.nftTraders}
                bgColor="bg-cyan-50"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WalletAnalysis