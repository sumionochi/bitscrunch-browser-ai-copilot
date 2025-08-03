"use client"

import type React from "react"
import { useState } from "react"
import { format } from "date-fns"

interface TraderChartProps {
  data: {
    date: string
    traders: number
    buyers: number
    sellers: number
  }[]
}

const TraderChart: React.FC<TraderChartProps> = ({ data }) => {
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    date: string
    values: { traders: number; buyers: number; sellers: number }
  } | null>(null)

  if (!data || data.length === 0) return null

  // Define a fixed viewBox for scaling
  const viewBoxWidth = 500
  const viewBoxHeight = 300
  const padding = 40
  const bottomPadding = 60 // Increased bottom padding for date labels
  const availableHeight = viewBoxHeight - (padding + bottomPadding)
  const availableWidth = viewBoxWidth - 2 * padding

  // Calculate max values for scaling within the viewBox
  const maxValue = Math.max(...data.map((d) => Math.max(d.traders, d.buyers, d.sellers)))

  // Scale values to fit chart height
  const scaleValue = (value: number) => {
    return (value / maxValue) * availableHeight
  }

  // Calculate bar width dynamically based on available width and number of data points
  const barGroupWidth = availableWidth / data.length
  const barWidth = Math.min(barGroupWidth / 3.5, 20) // Divide by 3.5 to leave some space between groups

  const handleMouseEnter = (event: React.MouseEvent<SVGGElement>, item: (typeof data)[0]) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY - 80, // Adjust tooltip position
      date: item.date,
      values: {
        traders: item.traders,
        buyers: item.buyers,
        sellers: item.sellers,
      },
    })
  }

  const handleMouseLeave = () => {
    setTooltip(null)
  }

  return (
    <div className="relative w-full h-[200px] sm:h-[300px] flex">
      {/* Y-axis labels (outside SVG for easier styling) */}
      <div className="absolute left-0 top-0 h-full w-8 sm:w-12 flex flex-col justify-between text-[8px] sm:text-sm font-bold text-gray-700 py-2 sm:py-4">
        <span>{maxValue.toFixed(0)}</span>
        <span>{(maxValue * 0.75).toFixed(0)}</span>
        <span>{(maxValue * 0.5).toFixed(0)}</span>
        <span>{(maxValue * 0.25).toFixed(0)}</span>
        <span>0</span>
      </div>

      {/* Chart area */}
      <div className="flex-grow ml-8 sm:ml-12 relative">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <line
              key={tick}
              x1={padding}
              y1={padding + availableHeight * tick}
              x2={viewBoxWidth - padding}
              y2={padding + availableHeight * tick}
              stroke="#000"
              strokeWidth="1"
              strokeDasharray="4"
            />
          ))}

          {/* Bars */}
          {data.map((item, index) => {
            const x = padding + index * barGroupWidth
            return (
              <g key={item.date} onMouseEnter={(e) => handleMouseEnter(e, item)} onMouseLeave={handleMouseLeave}>
                {/* Traders bar */}
                <rect
                  x={x}
                  y={viewBoxHeight - bottomPadding - scaleValue(item.traders)}
                  width={barWidth}
                  height={scaleValue(item.traders)}
                  fill="#6366f1"
                  stroke="#000"
                  strokeWidth="2"
                />
                {/* Buyers bar */}
                <rect
                  x={x + barWidth}
                  y={viewBoxHeight - bottomPadding - scaleValue(item.buyers)}
                  width={barWidth}
                  height={scaleValue(item.buyers)}
                  fill="#10b981"
                  stroke="#000"
                  strokeWidth="2"
                />
                {/* Sellers bar */}
                <rect
                  x={x + 2 * barWidth}
                  y={viewBoxHeight - bottomPadding - scaleValue(item.sellers)}
                  width={barWidth}
                  height={scaleValue(item.sellers)}
                  fill="#ef4444"
                  stroke="#000"
                  strokeWidth="2"
                />
              </g>
            )
          })}

          {/* X-axis labels (dates) - Rendered as SVG text for better scaling */}
          {data.map((item, index) => {
            const x = padding + index * barGroupWidth + barGroupWidth / 2 // Center of the bar group
            const date = new Date(item.date)
            const formattedDate = format(date, "MMM dd") // Shorter format for mobile

            return (
              <text
                key={item.date}
                x={x}
                y={viewBoxHeight - bottomPadding + 20} // Position below the bars
                textAnchor="middle"
                transform={`rotate(45 ${x},${viewBoxHeight - bottomPadding + 20})`} // Rotate for readability
                fontSize="10" // Smaller font size
                fontWeight="bold"
                fill="#000"
              >
                {formattedDate}
              </text>
            )
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border-2 sm:border-4 border-black p-2 sm:p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs sm:text-sm font-bold"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="mb-1 sm:mb-2">{tooltip.date}</p>
          <div className="space-y-0.5 sm:space-y-1">
            <p className="flex items-center gap-1 sm:gap-2">
              <span className="w-2 h-2 sm:w-3 sm:h-3 bg-[#6366f1] border border-black sm:border-2"></span>
              Traders: {tooltip.values.traders}
            </p>
            <p className="flex items-center gap-1 sm:gap-2">
              <span className="w-2 h-2 sm:w-3 sm:h-3 bg-[#10b981] border border-black sm:border-2"></span>
              Buyers: {tooltip.values.buyers}
            </p>
            <p className="flex items-center gap-1 sm:gap-2">
              <span className="w-2 h-2 sm:w-3 sm:h-3 bg-[#ef4444] border border-black sm:border-2"></span>
              Sellers: {tooltip.values.sellers}
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col sm:flex-row gap-1 sm:gap-4 bg-white p-1 sm:p-2 border border-black sm:border-2 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#6366f1] border border-black sm:border-2" />
          <span className="text-[10px] sm:text-sm font-bold">Traders</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#10b981] border border-black sm:border-2" />
          <span className="text-[10px] sm:text-sm font-bold">Buyers</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#ef4444] border border-black sm:border-2" />
          <span className="text-[10px] sm:text-sm font-bold">Sellers</span>
        </div>
      </div>
    </div>
  )
}

export default TraderChart
