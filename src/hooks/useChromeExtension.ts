import { useEffect, useState, useCallback } from 'react';

interface TabInfo {
  url: string;
  title: string;
  nftDetails: {
    blockchain: string;
    contractAddress: string;
    tokenId: string;
    source?: string;
  } | null;
  lastUpdated: number;
}

interface UseChromeExtensionReturn {
  tabInfo: TabInfo | null;
  isSidepanel: boolean;
  apiKey: string;
  setApiKey: (key: string) => void;
  refreshTabInfo: () => void;
  loading: boolean;
}

export const useChromeExtension = (): UseChromeExtensionReturn => {
  const [tabInfo, setTabInfo] = useState<TabInfo | null>(null);
  const [apiKey, setApiKeyState] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isSidepanel, setIsSidepanel] = useState(false);

  // Check if we're running in a sidepanel
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      setIsSidepanel(true);
    }
  }, []);

  // Load API key from storage
  const loadApiKey = useCallback(async () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.local.get(['nft_analytics_api_key']);
        setApiKeyState(result.nft_analytics_api_key || '');
      } catch (error) {
        console.error('Error loading API key:', error);
      }
    }
  }, []);

  // Save API key to storage
  const saveApiKey = useCallback(async (key: string) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.local.set({ nft_analytics_api_key: key });
        setApiKeyState(key);
      } catch (error) {
        console.error('Error saving API key:', error);
      }
    }
  }, []);

  // Get current tab info
  const getCurrentTabInfo = useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return null;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CURRENT_TAB_INFO'
      });
      return response;
    } catch (error) {
      console.error('Error getting tab info:', error);
      return null;
    }
  }, []);

  // Refresh tab info
  const refreshTabInfo = useCallback(async () => {
    setLoading(true);
    try {
      const info = await getCurrentTabInfo();
      if (info && !('error' in info)) {
        setTabInfo(info);
      }
    } catch (error) {
      console.error('Error refreshing tab info:', error);
    } finally {
      setLoading(false);
    }
  }, [getCurrentTabInfo]);

  // Set API key
  const setApiKey = useCallback((key: string) => {
    saveApiKey(key);
  }, [saveApiKey]);

  // Listen for tab info updates
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return;
    }

    const handleMessage = (message: any) => {
      if (message.type === 'TAB_INFO_UPDATED') {
        setTabInfo(message.data);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Initial setup
  useEffect(() => {
    loadApiKey();
    refreshTabInfo();
  }, [loadApiKey, refreshTabInfo]);

  return {
    tabInfo,
    isSidepanel,
    apiKey,
    setApiKey,
    refreshTabInfo,
    loading
  };
}; 