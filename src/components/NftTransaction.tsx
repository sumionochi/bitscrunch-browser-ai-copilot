import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import { LoaderCircle } from "lucide-react";

/* ──────────────────────────
   Types & Interfaces
   ────────────────────────── */
interface NftTransaction {
  block_date: string;
  blockchain: number;
  chain_id: number;
  collection: string;
  contract_address: string;
  contract_created_date: string;
  contract_type: string;
  hash: string;
  is_washtrade: string;
  marketplace: string;
  receiving_address: string;
  sale_price_usd: number;
  sending_address: string;
  timestamp: string;
  token_id: string;
  transaction_type: string;
}

interface NftTransactionProps {
  blockchain: string;
  contractAddress: string;
  tokenId: string;
  timeRange: string;
  apiKey: string;
  setTimeRange: (timeRange: string) => void; // accepted but not used here
}

/* ──────────────────────────
   Local cache helpers
   ────────────────────────── */
interface CacheData {
  data: any;
  timestamp: number;
  expiresIn: number;
}

const CACHE_DURATION = {
  TRANSACTIONS: 5 * 60 * 1000, // 5 min
};

/* ──────────────────────────
   Component
   ────────────────────────── */
const NftTransaction: React.FC<NftTransactionProps> = ({
  blockchain,
  contractAddress,
  tokenId,
  timeRange,
  apiKey,
}) => {
  /* STATE */
  const [transactions, setTransactions] = useState<NftTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* refs for cache & debounce */
  const cacheRef = useRef<Record<string, CacheData>>({});
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  /* ── cache helpers ── */
  const keyOf = (p: object) => `transactions_${JSON.stringify(p)}`;
  const getCached = (k: string) =>
    cacheRef.current[k] &&
    Date.now() < cacheRef.current[k].timestamp + cacheRef.current[k].expiresIn
      ? cacheRef.current[k].data
      : null;
  const setCached = (k: string, d: any) =>
    (cacheRef.current[k] = {
      data: d,
      timestamp: Date.now(),
      expiresIn: CACHE_DURATION.TRANSACTIONS,
    });
  const purge = (k: string) => delete cacheRef.current[k];

  /* ── fetcher ── */
  const fetchTransactions = useCallback(async () => {
    if (!apiKey) return;

    /* NOTE: token_id must be an array & sort_by is required by API */
    const params = {
      blockchain,
      contract_address: contractAddress,
      token_id: [tokenId],
      time_range: timeRange,
      sort_by: "timestamp",
      sort_order: "desc",
    };
    const cacheKey = keyOf(params);

    const cached = getCached(cacheKey);
    if (cached) {
      setTransactions(cached);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await axios.get(
        "https://api.unleashnfts.com/api/v2/nft/transactions",
        { params, headers: { "x-api-key": apiKey } }
      );

      const data: NftTransaction[] = Array.isArray(res.data.data)
        ? res.data.data
        : [res.data.data];

      setTransactions(data.filter((tx): tx is NftTransaction => tx !== null));
      setCached(cacheKey, data);
    } catch (e) {
      console.error("Error fetching transactions:", e);
      setError("Failed to fetch transaction data");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, blockchain, contractAddress, tokenId, timeRange]);

  /* ── retry ── */
  const retry = () => {
    purge(
      keyOf({
        blockchain,
        contract_address: contractAddress,
        token_id: [tokenId],
        time_range: timeRange,
        sort_by: "timestamp",
        sort_order: "desc",
      })
    );
    fetchTransactions();
  };

  /* ── debounced trigger ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (blockchain && contractAddress && tokenId && timeRange) fetchTransactions();
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [fetchTransactions]);

  /* ── UI helpers ── */
  const Banner = ({ msg }: { msg: string }) => (
    <div className="flex items-center space-x-2 p-4 bg-blue-100 border-4 border-black">
      <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
      <span className="font-bold text-sm">{msg}</span>
    </div>
  );

  const RetryBtn = () => (
    <button
      onClick={retry}
      className="ml-3 bg-blue-200 px-4 py-1 border-2 border-black hover:bg-blue-300 transition-all"
    >
      Retry
    </button>
  );

  /* ── render ── */
  if (isLoading) return <Banner msg="Fetching transactions…" />;

  if (error)
    return (
      <div className="p-4 bg-red-100 border-4 border-black font-bold">
        {error}
        <RetryBtn />
      </div>
    );

  if (!transactions.length)
    return (
      <div className="p-4 bg-yellow-100 border-4 border-black font-bold">
        No transactions found for this NFT.
        <RetryBtn />
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-orange-200 border-4 border-black">
            <th className="p-2 text-left font-black">Date</th>
            <th className="p-2 text-left font-black">Type</th>
            <th className="p-2 text-left font-black">Price&nbsp;(USD)</th>
            <th className="p-2 text-left font-black">Marketplace</th>
            <th className="p-2 text-left font-black">From</th>
            <th className="p-2 text-left font-black">To</th>
            <th className="p-2 text-left font-black">Wash&nbsp;Trade</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => (
            <tr
              key={tx.hash}
              className={`border-4 border-black ${
                i % 2 ? "bg-gray-50" : "bg-white"
              } hover:bg-yellow-100`}
            >
              <td className="p-2 font-bold">
                {format(new Date(tx.timestamp), "MMM dd, yyyy HH:mm")}
              </td>
              <td className="p-2 font-bold uppercase">{tx.transaction_type}</td>
              <td className="p-2 font-bold">${tx.sale_price_usd.toFixed(2)}</td>
              <td className="p-2 font-bold uppercase">{tx.marketplace}</td>
              <td className="p-2 font-bold">
                {tx.sending_address.slice(0, 6)}…{tx.sending_address.slice(-4)}
              </td>
              <td className="p-2 font-bold">
                {tx.receiving_address.slice(0, 6)}…{tx.receiving_address.slice(
                  -4
                )}
              </td>
              <td className="p-2 font-bold">
                <span
                  className={`px-2 py-1 border-2 border-black rounded ${
                    tx.is_washtrade === "Not Washtrade"
                      ? "bg-green-200"
                      : "bg-red-200"
                  }`}
                >
                  {tx.is_washtrade}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default NftTransaction;
