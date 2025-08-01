import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface MetricSelectProps {
  metricsData: Array<{
    value: string;
    label: string;
  }>;
  setMetric: (value: string) => void;
  metric: string;
}

const MetricSelect: React.FC<MetricSelectProps> = ({
  metricsData,
  setMetric,
  metric,
}) => {
  const currentMetric = metricsData.find(m => m.value === metric) || metricsData[0];

  return (
    <Select
      value={metric}
      onValueChange={setMetric}
    >
      <SelectTrigger className="h-12 border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all">
        <SelectValue>
          <span>{currentMetric?.label || "Select Metric"}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="border-4 border-black bg-white text-black max-h-60 overflow-y-auto">
        <SelectGroup>
          {metricsData.map((metric) => (
            <SelectItem
              key={metric.value}
              value={metric.value}
              className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer"
            >
              {metric.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default MetricSelect;