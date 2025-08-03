import type React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

interface NftPriceEstimationProps {
  data?: {
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
  } | null
}

const NftPriceCard: React.FC<NftPriceEstimationProps> = ({ data }) => {
  if (!data) {
    return (
      <Card className="bg-white border-2 sm:border-4 border-black p-2 sm:p-4">
        <CardContent className="flex items-center justify-center h-20 sm:h-32">
          <p className="text-sm sm:text-lg font-bold text-gray-500 text-center px-2">
            No price estimation data available
          </p>
        </CardContent>
      </Card>
    )
  }

  // Convert string values to numbers for the drivers
  const collectionDriver = Number.parseFloat(data.collection_drivers)
  const rarityDriver = Number.parseFloat(data.nft_rarity_drivers)
  const salesDriver = Number.parseFloat(data.nft_sales_drivers)
  const gaugePercentage = Number.parseFloat(data.prediction_percentile) * 100

  return (
    <Card className="bg-white border-2 sm:border-4 border-black p-2 sm:p-4">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 p-2 sm:p-6">
        <img
          src={data.token_image_url || data.thumbnail_url}
          alt={`${data.collection_name} #${data.token_id}`}
          className="w-20 h-20 sm:w-32 sm:h-32 object-cover border-2 sm:border-4 border-black flex-shrink-0 mx-auto sm:mx-0"
        />
        <div className="text-center sm:text-left w-full sm:w-auto">
          <CardTitle className="text-sm sm:text-xl font-black uppercase bg-orange-200 p-1 sm:p-2 border-2 sm:border-4 border-black inline-block">
            {data.collection_name}
          </CardTitle>
          <p className="mt-1 sm:mt-2 font-bold text-xs sm:text-base">Token ID: #{data.token_id}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-6 p-2 sm:p-6">
        <div className="bg-yellow-100 p-2 sm:p-4 border-2 sm:border-4 border-black space-y-1 sm:space-y-2">
          <h3 className="font-black text-sm sm:text-lg">Price Estimates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
            <div className="text-start">
              <p className="font-bold text-xs sm:text-sm">Lower Bound</p>
              <p className="text-sm sm:text-lg font-black text-blue-600">
                {data.price_estimate_lower_bound.toFixed(4)} ETH
              </p>
            </div>
            <div className="text-start">
              <p className="font-bold text-xs sm:text-sm">Estimate</p>
              <p className="text-sm sm:text-lg font-black text-green-600">{data.price_estimate.toFixed(4)} ETH</p>
            </div>
            <div className="text-start">
              <p className="font-bold text-xs sm:text-sm">Upper Bound</p>
              <p className="text-sm sm:text-lg font-black text-red-600">{data.price_estimate_upper_bound.toFixed(4)} ETH</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
          <h3 className="font-black text-sm sm:text-lg mb-1 sm:mb-2">Prediction Confidence</h3>
          <div className="relative h-4 sm:h-6 bg-gray-200 border border-black sm:border-2">
            <div
              className="absolute h-full bg-green-400 border-r border-black sm:border-r-2"
              style={{ width: `${gaugePercentage}%` }}
            />
            <span className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 font-bold text-xs sm:text-sm">
              {gaugePercentage.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="bg-pink-100 p-2 sm:p-4 border-2 sm:border-4 border-black space-y-2 sm:space-y-4">
          <h3 className="font-black text-sm sm:text-lg">Market Drivers</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
            <div>
              <p className="font-bold text-xs sm:text-sm">Collection</p>
              <p
                className={`text-sm sm:text-lg font-black ${collectionDriver > 0 ? "text-green-600" : "text-red-600"}`}
              >
                {collectionDriver.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="font-bold text-xs sm:text-sm">Rarity</p>
              <p className={`text-sm sm:text-lg font-black ${rarityDriver > 0 ? "text-green-600" : "text-red-600"}`}>
                {rarityDriver.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="font-bold text-xs sm:text-sm">Sales</p>
              <p className={`text-sm sm:text-lg font-black ${salesDriver > 0 ? "text-green-600" : "text-red-600"}`}>
                {salesDriver.toFixed(4)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-purple-100 p-2 sm:p-4 border-2 sm:border-4 border-black">
          <h3 className="font-black text-sm sm:text-lg mb-1 sm:mb-2">NFT Details</h3>
          <p className="font-bold text-xs sm:text-sm break-all">Contract: <span className="text-blue-600">{data.address}</span></p>
          <p className="font-bold text-xs sm:text-sm">Chain ID: <span className="text-blue-600">{data.chain_id}</span></p>
        </div>
      </CardContent>
    </Card>
  )
}

export default NftPriceCard
