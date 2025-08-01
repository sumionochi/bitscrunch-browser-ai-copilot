// Background script for BitsCrunch NFT Analytics Extension

// Function to extract NFT details from OpenSea URL
function extractNFTDetails(url) {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('opensea.io')) return null;
    
    const parts = urlObj.pathname.split('/').filter(part => part.length > 0);
    
    // Handle OpenSea URL format with 'item' path: https://opensea.io/item/[blockchain]/[contract_address]/[token_id]
    if (parts.includes('item') && parts.length >= 4) {
      const itemIndex = parts.indexOf('item');
      if (itemIndex + 3 < parts.length) {
        return {
          blockchain: parts[itemIndex + 1],
          contractAddress: parts[itemIndex + 2],
          tokenId: parts[itemIndex + 3]
        };
      }
    }
    
    // Handle traditional OpenSea URL format: https://opensea.io/assets/[blockchain]/[contract_address]/[token_id]
    if (parts.includes('assets') && parts.length >= 4) {
      const assetIndex = parts.indexOf('assets');
      if (assetIndex + 3 < parts.length) {
        return {
          blockchain: parts[assetIndex + 1],
          contractAddress: parts[assetIndex + 2],
          tokenId: parts[assetIndex + 3]
        };
      }
    }
    
    // Handle newer OpenSea URL format: https://opensea.io/[collection]/[token_id]
    // For this format, we need to extract details from the page content
    // But we can at least detect if we're on an NFT page
    if (parts.length >= 2 && !['assets', 'item', 'collection', 'rankings', 'activity', 'explore'].includes(parts[0])) {
      // This appears to be a collection item page
      // We'll return a placeholder that indicates we're on an NFT page
      // The actual details will need to be extracted from the page content
      return {
        blockchain: 'ethereum', // Default to ethereum
        contractAddress: parts[0], // Use collection slug as placeholder
        tokenId: parts[1] // Use the token identifier
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing OpenSea URL:', error);
    return null;
  }
}

// Function to extract NFT details from page content using content script
function extractNFTDetailsFromPage(tabId) {
  return new Promise((resolve) => {
    // Execute a content script to extract NFT details from the page
    chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
        // Try to find NFT details in the page content
        try {
          // First, try to extract from URL for the most accurate path-based extraction
          const url = window.location.href;
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
          
          // Handle OpenSea URL format with 'item' path: https://opensea.io/item/[blockchain]/[contract_address]/[token_id]
          if (pathParts.includes('item') && pathParts.length >= 4) {
            const itemIndex = pathParts.indexOf('item');
            if (itemIndex + 3 < pathParts.length) {
              return {
                blockchain: pathParts[itemIndex + 1],
                contractAddress: pathParts[itemIndex + 2],
                tokenId: pathParts[itemIndex + 3]
              };
            }
          }
          
          // Second, try to extract from OpenSea's JSON-LD data which contains accurate information
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of jsonLdScripts) {
            try {
              const jsonLdData = JSON.parse(script.textContent);
              
              // Check for NFT data in various JSON-LD formats
              if (jsonLdData && jsonLdData.offers && jsonLdData.offers.itemOffered) {
                const item = jsonLdData.offers.itemOffered;
                if (item.identifier) {
                  // The identifier often contains the contract address and token ID
                  const parts = item.identifier.split('/');
                  if (parts.length >= 2) {
                    return {
                      blockchain: 'ethereum', // Usually ethereum on OpenSea
                      contractAddress: parts[0],
                      tokenId: parts[1]
                    };
                  }
                }
              }
            } catch (e) {
              // Continue to next script
            }
          }
          
          // Third, try to extract from OpenSea's internal data structures
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            try {
              const content = script.textContent;
              if (content.includes('"asset"') && content.includes('"token_id"')) {
                const assetMatch = content.match(/"asset":\s*{[^}]+}/);
                if (assetMatch) {
                  const assetData = JSON.parse(assetMatch[0].replace(/"asset":\s*/, ''));
                  if (assetData.asset_contract && assetData.token_id) {
                    return {
                      blockchain: assetData.asset_contract.chain || 'ethereum',
                      contractAddress: assetData.asset_contract.address,
                      tokenId: assetData.token_id
                    };
                  }
                }
              }
            } catch (e) {
              // Continue to next script
            }
          }
          
          return null;
        } catch (error) {
          console.error('Error extracting NFT details from page:', error);
          return null;
        }
      }
    }, (results) => {
      if (results && results[0] && results[0].result) {
        resolve(results[0].result);
      } else {
        resolve(null);
      }
    });
  });
}

// Store current tab info for sidepanel
let currentTabInfo = {
  url: '',
  title: '',
  nftDetails: null,
  lastUpdated: 0
};

// Listen for messages from the popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_API_KEY') {
    // Retrieve API key from storage
    chrome.storage.local.get(['nft_analytics_api_key'], (result) => {
      sendResponse({ apiKey: result.nft_analytics_api_key || '' });
    });
    return true; // Required for async response
  }

  if (request.type === 'SET_API_KEY') {
    // Store API key
    chrome.storage.local.set({ nft_analytics_api_key: request.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'GET_NFT_DETAILS') {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      const currentTab = tabs[0];
      
      // First try to extract from URL
      let nftDetails = extractNFTDetails(currentTab.url);
      
      // If that fails, try to extract from page content
      if (!nftDetails) {
        try {
          nftDetails = await extractNFTDetailsFromPage(currentTab.id);
        } catch (error) {
          console.error('Error extracting from page:', error);
        }
      }
      
      sendResponse({ nftDetails });
    });
    return true;
  }

  // Handle content script messages
  if (request.type === 'PAGE_LOADED' || request.type === 'URL_CHANGED') {
    currentTabInfo = {
      url: request.url,
      title: sender.tab?.title || '',
      nftDetails: request.nftDetails,
      lastUpdated: Date.now()
    };
    
    // Notify sidepanel if it's open
    chrome.runtime.sendMessage({
      type: 'TAB_INFO_UPDATED',
      data: currentTabInfo
    }).catch(() => {
      // Sidepanel might not be listening, that's okay
    });
  }

  // Handle sidepanel requests
  if (request.type === 'GET_CURRENT_TAB_INFO') {
    // Return cached info if recent, otherwise fetch fresh data
    const now = Date.now();
    if (now - currentTabInfo.lastUpdated < 5000 && currentTabInfo.url) {
      sendResponse(currentTabInfo);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs.length > 0) {
          const currentTab = tabs[0];
          
          // First try to extract from URL
          let nftDetails = extractNFTDetails(currentTab.url);
          
          // If that fails, try to extract from page content
          if (!nftDetails) {
            try {
              nftDetails = await extractNFTDetailsFromPage(currentTab.id);
            } catch (error) {
              console.error('Error extracting from page:', error);
            }
          }
          
          currentTabInfo = {
            url: currentTab.url,
            title: currentTab.title,
            nftDetails,
            lastUpdated: now
          };
          
          sendResponse(currentTabInfo);
        } else {
          sendResponse({ error: 'No active tab found' });
        }
      });
      return true; // Keep the message channel open for async response
    }
  }
});

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('BitsCrunch NFT Analytics Extension installed');
  
  // Set up sidepanel
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Handle tab updates to keep sidepanel in sync
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    // Update current tab info when a tab finishes loading
    currentTabInfo = {
      url: tab.url,
      title: tab.title,
      nftDetails: extractNFTDetails(tab.url),
      lastUpdated: Date.now()
    };
  }
});

// Handle tab activation to keep sidepanel in sync
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    currentTabInfo = {
      url: tab.url,
      title: tab.title,
      nftDetails: extractNFTDetails(tab.url),
      lastUpdated: Date.now()
    };
    
    // Notify sidepanel
    chrome.runtime.sendMessage({
      type: 'TAB_INFO_UPDATED',
      data: currentTabInfo
    }).catch(() => {
      // Sidepanel might not be listening, that's okay
    });
  } catch (error) {
    console.error('Error handling tab activation:', error);
  }
});