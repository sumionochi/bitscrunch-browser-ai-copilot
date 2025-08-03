import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Blockchain } from "@/App";
import { CircleDollarSign } from "lucide-react";

interface ChainSelectProps {
  optionBlockchain: Blockchain[];
  setBlockchain: (value: string) => void;
  setBlockchainString: (value: string) => void;
  blockchain: string;
  val: string;
}

const ChainSelect: React.FC<ChainSelectProps> = ({
  optionBlockchain,
  setBlockchain,
  setBlockchainString,
  blockchain,
  val,
}) => {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (name: string) => {
    setImageErrors(prev => ({ ...prev, [name]: true }));
  };

  // Create blockchain options only when available
  const blockchainOptions = optionBlockchain.map((item: Blockchain) => ({
    value: item.id.toString(),
    label: item.name,
    icon: item.image_url,
    name: item.name,
  }));

  // Find current value or use first option as fallback
  const currentValue = blockchainOptions.find((option) => 
    val === "id" 
      ? option.value === blockchain 
      : option.name.toLowerCase() === blockchain.toLowerCase()
  ) || (blockchainOptions[0] ? blockchainOptions[0] : null);

  const handleValueChange = (value: string) => {
    const selectedOption = blockchainOptions.find((opt) => opt.value === value);
    if (!selectedOption) return;

    if (val === "id") {
      setBlockchain(selectedOption.value);
    } else {
      const chainName = selectedOption.name.toLowerCase();
      setBlockchain(chainName === "ordinals" ? "bitcoin" : chainName.split(" ")[0]);
    }

    const blockchainStr = selectedOption.name === "Ordinals" 
      ? "bitcoin" 
      : selectedOption.name.split(" ")[0].toLowerCase();
    setBlockchainString(blockchainStr);
  };

  // Don't render the select if there are no options
  if (blockchainOptions.length === 0) {
    return (
      <div className="h-12 border-4 border-black bg-white flex items-center px-4">
        <span className="text-gray-500">Loading blockchains...</span>
      </div>
    );
  }

  return (
    <Select
      value={currentValue?.value || blockchainOptions[0].value}
      onValueChange={handleValueChange}
    >
      <SelectTrigger className="h-10 md:h-12 border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all">
        <div className="flex items-center gap-2">
          {currentValue && (
            <>
              {imageErrors[currentValue.name] ? (
                <CircleDollarSign className="w-5 h-5 md:w-6 md:h-6 rounded-full" />
              ) : (
                <img
                  src={currentValue.icon}
                  alt={currentValue.label}
                  className="w-5 h-5 md:w-6 md:h-6 rounded-full"
                  onError={() => handleImageError(currentValue.name)}
                />
              )}
              <SelectValue>
                <span className="text-xs md:text-sm">{currentValue.label}</span>
              </SelectValue>
            </>
          )}
        </div>
      </SelectTrigger>
      <SelectContent className="border-4 border-black bg-white text-black max-h-60 overflow-y-auto">
        <SelectGroup>
          {blockchainOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="hover:bg-zinc-200 focus:bg-blue-500 focus:text-white cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {imageErrors[option.name] ? (
                  <CircleDollarSign className="w-6 h-6 rounded-full" />
                ) : (
                  <img
                    src={option.icon}
                    alt={option.label}
                    className="w-6 h-6 rounded-full"
                    onError={() => handleImageError(option.name)}
                  />
                )}
                <span>{option.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default ChainSelect;