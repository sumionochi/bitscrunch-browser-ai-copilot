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
      <div className="bg-white border-2 sm:border-4 border-black p-2 sm:p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs sm:text-sm">
        <p className="font-black uppercase mb-1 sm:mb-2">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} className="font-bold" style={{ color: entry.color }}>
            {`${entry.name}: ${entry.value !== undefined ? entry.value.toFixed(2) : "N/A"}`}
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
            className={`px-2 py-1 sm:px-4 sm:py-2 font-bold text-xs sm:text-sm border-2 border-black ${
              activeTab === "volume"
                ? "bg-orange-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "bg-white hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            }`}
          >
            Washtrade Volume
          </button>
          <button
            onClick={() => setActiveTab("assets")}
            className={`px-2 py-1 sm:px-4 sm:py-2 font-bold text-xs sm:text-sm border-2 border-black ${
              activeTab === "assets"
                ? "bg-orange-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "bg-white hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            }`}
          >
            Assets v/s Suspect Sales
          </button>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#000000" strokeWidth={0.5} />
          <XAxis
            dataKey="timestamp"
            reversed
            stroke="#000000"
            strokeWidth={2}
            tick={{ fill: "#000000", fontSize: 8, fontWeight: "bold" }} // Smaller font size for mobile
            tickFormatter={(value) => format(new Date(value), "MMM dd")} // Shorter date format
          />
          <YAxis
            label={{
              value: showTraders ? "Count" : "(USD)",
              angle: -90,
              position: "insideLeft",
              fill: "#000000",
              fontWeight: "bold",
              fontSize: 10, // Smaller font size for mobile
            }}
            tickFormatter={(value) => {
              if (showWashtrade) {
                if (activeTab === "volume") {
                  return `${(value / 1e6).toFixed(1)}M`
                } else {
                  return value.toLocaleString()
                }
              }
              return `${(value / 1e6).toFixed(1)}M`
            }}
            domain={["auto", "auto"]}
            stroke="#000000"
            strokeWidth={2}
            tick={{ fill: "#000000", fontSize: 8, fontWeight: "bold" }} // Smaller font size for mobile
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              fontWeight: "bold",
              border: "1px solid #000000", // Smaller border
              padding: "4px", // Reduced padding
              fontSize: "10px", // Smaller font size
            }}
          />
          {!showTraders && !showWashtrade && metric && (
            <Line
              type="monotone"
              dataKey={metric}
              stroke="#fbbf24"
              strokeWidth={3}
              dot={{ stroke: "#000000", strokeWidth: 2, r: 2, fill: "#fbbf24" }} // Smaller dots
              activeDot={{ stroke: "#000000", strokeWidth: 2, r: 4, fill: "#fbbf24" }} // Smaller active dots
            />
          )}
          {showTraders && (
            <>
              <Line
                type="monotone"
                dataKey="traders"
                name="Traders"
                stroke="#6366f1"
                strokeWidth={3}
                dot={{ stroke: "#000000", strokeWidth: 2, r: 2, fill: "#6366f1" }}
                activeDot={{ stroke: "#000000", strokeWidth: 2, r: 4, fill: "#6366f1" }}
              />
              <Line
                type="monotone"
                dataKey="buyers"
                name="Buyers"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ stroke: "#000000", strokeWidth: 2, r: 2, fill: "#10b981" }}
                activeDot={{ stroke: "#000000", strokeWidth: 2, r: 4, fill: "#10b981" }}
              />
              <Line
                type="monotone"
                dataKey="sellers"
                name="Sellers"
                stroke="#ef4444"
                strokeWidth={3}
                dot={{ stroke: "#000000", strokeWidth: 2, r: 2, fill: "#ef4444" }}
                activeDot={{ stroke: "#000000", strokeWidth: 2, r: 4, fill: "#ef4444" }}
              />
            </>
          )}
          {showWashtrade && activeTab === "volume" && (
            <Line
              type="monotone"
              dataKey="washtrade_volume"
              name="Washtrade Volume"
              stroke="#ff7300"
              strokeWidth={3}
              dot={{ stroke: "#000000", strokeWidth: 2, r: 2, fill: "#ff7300" }}
              activeDot={{ stroke: "#000000", strokeWidth: 2, r: 4, fill: "#ff7300" }}
            />
          )}
          {showWashtrade && activeTab === "assets" && (
            <>
              <Line
                type="monotone"
                dataKey="washtrade_assets"
                name="Washtrade Assets"
                stroke="#8884d8"
                strokeWidth={3}
                dot={{ stroke: "#000000", strokeWidth: 2, r: 2, fill: "#8884d8" }}
                activeDot={{ stroke: "#000000", strokeWidth: 2, r: 4, fill: "#8884d8" }}
              />
              <Line
                type="monotone"
                dataKey="washtrade_suspect_sales"
                name="Suspect Sales"
                stroke="#82ca9d"
                strokeWidth={3}
                dot={{ stroke: "#000000", strokeWidth: 2, r: 2, fill: "#82ca9d" }}
                activeDot={{ stroke: "#000000", strokeWidth: 2, r: 4, fill: "#82ca9d" }}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default Chart
