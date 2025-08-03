"use client"

import type React from "react"
import { useState } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { format } from "date-fns"

interface ChartProps {
  data:
    | {
        timestamp: string
        [key: string]: string | number
      }[]
    | undefined
  metric?: string
  showTraders?: boolean
  showWashtrade?: boolean
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border-2 sm:border-4 border-black p-2 sm:p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs sm:text-sm font-bold">
        <p className="font-black uppercase mb-1 sm:mb-2">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} className="font-bold" style={{ color: entry.color }}>
            {`${entry.name}: ${typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}`}
          </p>
        ))}
      </div>
    )
  }
  return null
}

const Chart: React.FC<ChartProps> = ({ data, metric, showTraders, showWashtrade }) => {
  const [activeTab, setActiveTab] = useState<"volume" | "assets">("volume")

  if (!data) return null

  return (
    <div className="p-2 sm:p-4 bg-white border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      {showWashtrade && (
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 mb-2 sm:mb-4">
          <button
            onClick={() => setActiveTab("volume")}
            className={`w-full sm:w-auto px-3 py-1 sm:px-4 sm:py-2 font-bold text-xs sm:text-sm ${
              activeTab === "volume"
                ? "bg-orange-200 border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "bg-white border-2 sm:border-4 border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            }`}
          >
            Washtrade Volume
          </button>
          <button
            onClick={() => setActiveTab("assets")}
            className={`w-full sm:w-auto px-3 py-1 sm:px-4 sm:py-2 font-bold text-xs sm:text-sm ${
              activeTab === "assets"
                ? "bg-orange-200 border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "bg-white border-2 sm:border-4 border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            }`}
          >
            Assets v/s Suspect Sales
          </button>
        </div>
      )}
      <ResponsiveContainer width="100%" height={200} className="sm:h-[270px]">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#000000" strokeWidth={0.5} />
          <XAxis
            dataKey="timestamp"
            reversed
            stroke="#000000"
            strokeWidth={1}
            tick={{ fill: "#000000", fontSize: 10, fontWeight: "bold" }}
            tickFormatter={(value) => {
              // Format date for smaller screens
              const date = new Date(value)
              return format(date, "MMM dd")
            }}
            interval="preserveStartEnd" // Helps prevent too many labels
          />
          <YAxis
            label={{
              value: showTraders ? "Count" : "(USD)",
              angle: -90,
              position: "insideLeft",
              fill: "#000000",
              fontWeight: "bold",
              fontSize: 10,
            }}
            tickFormatter={(value) => {
              if (showWashtrade && activeTab === "volume") {
                return `${(value / 1e6).toFixed(1)}M`
              }
              // Default for other metrics, including assets and non-washtrade volume
              if (value >= 1e6) {
                return `${(value / 1e6).toFixed(1)}M`
              }
              if (value >= 1e3) {
                return `${(value / 1e3).toFixed(1)}K`
              }
              return value.toLocaleString()
            }}
            domain={["auto", "auto"]}
            stroke="#000000"
            strokeWidth={1}
            tick={{ fill: "#000000", fontSize: 10, fontWeight: "bold" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              fontWeight: "bold",
              border: "1px solid #000000",
              padding: "4px",
              fontSize: "10px",
              marginTop: "8px", // Add some margin to separate from chart
            }}
          />
          {!showTraders && !showWashtrade && metric && (
            <Line
              type="monotone"
              dataKey={metric}
              stroke="#fbbf24"
              strokeWidth={2}
              dot={{ stroke: "#000000", strokeWidth: 1, r: 3, fill: "#fbbf24" }}
              activeDot={{ stroke: "#000000", strokeWidth: 1, r: 5, fill: "#fbbf24" }}
            />
          )}
          {showTraders && (
            <>
              <Line
                type="monotone"
                dataKey="traders"
                name="Traders"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ stroke: "#000000", strokeWidth: 1, r: 3, fill: "#6366f1" }}
                activeDot={{ stroke: "#000000", strokeWidth: 1, r: 5, fill: "#6366f1" }}
              />
              <Line
                type="monotone"
                dataKey="buyers"
                name="Buyers"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ stroke: "#000000", strokeWidth: 1, r: 3, fill: "#10b981" }}
                activeDot={{ stroke: "#000000", strokeWidth: 1, r: 5, fill: "#10b981" }}
              />
              <Line
                type="monotone"
                dataKey="sellers"
                name="Sellers"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ stroke: "#000000", strokeWidth: 1, r: 3, fill: "#ef4444" }}
                activeDot={{ stroke: "#000000", strokeWidth: 1, r: 5, fill: "#ef4444" }}
              />
            </>
          )}
          {showWashtrade && activeTab === "volume" && (
            <Line
              type="monotone"
              dataKey="washtrade_volume"
              name="Washtrade Volume"
              stroke="#ff7300"
              strokeWidth={2}
              dot={{ stroke: "#000000", strokeWidth: 1, r: 3, fill: "#ff7300" }}
              activeDot={{ stroke: "#000000", strokeWidth: 1, r: 5, fill: "#ff7300" }}
            />
          )}
          {showWashtrade && activeTab === "assets" && (
            <>
              <Line
                type="monotone"
                dataKey="washtrade_assets"
                name="Washtrade Assets"
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ stroke: "#000000", strokeWidth: 1, r: 3, fill: "#8884d8" }}
                activeDot={{ stroke: "#000000", strokeWidth: 1, r: 5, fill: "#8884d8" }}
              />
              <Line
                type="monotone"
                dataKey="washtrade_suspect_sales"
                name="Suspect Sales"
                stroke="#82ca9d"
                strokeWidth={2}
                dot={{ stroke: "#000000", strokeWidth: 1, r: 3, fill: "#82ca9d" }}
                activeDot={{ stroke: "#000000", strokeWidth: 1, r: 5, fill: "#82ca9d" }}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default Chart
