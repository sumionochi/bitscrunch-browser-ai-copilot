// Content script for BitsCrunch NFT Analytics Extension
// This script is injected into web pages to extract NFT details

(function() {
  'use strict';

  // Function to extract NFT details from OpenSea page
  function extractOpenSeaNFTDetails() {
    try {
      // Method 1: Extract from URL
      const url = window.location.href;
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      
      // Handle OpenSea URL format with 'item' path
      if (pathParts.includes('item') && pathParts.length >= 4) {
        const itemIndex = pathParts.indexOf('item');
        if (itemIndex + 3 < pathParts.length) {
          return {
            blockchain: pathParts[itemIndex + 1],
            contractAddress: pathParts[itemIndex + 2],
            tokenId: pathParts[itemIndex + 3],
            source: 'url'
          };
        }
      }
      
      // Handle traditional OpenSea URL format
      if (pathParts.includes('assets') && pathParts.length >= 4) {
        const assetIndex = pathParts.indexOf('assets');
        if (assetIndex + 3 < pathParts.length) {
          return {
            blockchain: pathParts[assetIndex + 1],
            contractAddress: pathParts[assetIndex + 2],
            tokenId: pathParts[assetIndex + 3],
            source: 'url'
          };
        }
      }
      
      // Method 2: Extract from JSON-LD data
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const jsonLdData = JSON.parse(script.textContent);
          
          if (jsonLdData && jsonLdData.offers && jsonLdData.offers.itemOffered) {
            const item = jsonLdData.offers.itemOffered;
            if (item.identifier) {
              const parts = item.identifier.split('/');
              if (parts.length >= 2) {
                return {
                  blockchain: 'ethereum',
                  contractAddress: parts[0],
                  tokenId: parts[1],
                  source: 'json-ld'
                };
              }
            }
          }
        } catch (e) {
          // Continue to next script
        }
      }
      
      // Method 3: Extract from OpenSea's internal data
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
                  tokenId: assetData.token_id,
                  source: 'internal-data'
                };
              }
            }
          }
        } catch (e) {
          // Continue to next script
        }
      }
      
      // Method 4: Extract from newer OpenSea format
      if (pathParts.length >= 2 && !['assets', 'item', 'collection', 'rankings', 'activity', 'explore'].includes(pathParts[0])) {
        return {
          blockchain: 'ethereum',
          contractAddress: pathParts[0],
          tokenId: pathParts[1],
          source: 'new-format'
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting NFT details:', error);
      return null;
    }
  }

  // Function to get page metadata
  function getPageMetadata() {
    return {
      url: window.location.href,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
      ogTitle: document.querySelector('meta[property="og:title"]')?.content || ''
    };
  }

  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXTRACT_NFT_DETAILS') {
      const nftDetails = extractOpenSeaNFTDetails();
      const metadata = getPageMetadata();
      
      sendResponse({
        nftDetails,
        metadata,
        timestamp: Date.now()
      });
    }
    
    if (request.type === 'GET_PAGE_INFO') {
      sendResponse({
        url: window.location.href,
        title: document.title,
        nftDetails: extractOpenSeaNFTDetails(),
        metadata: getPageMetadata()
      });
    }
  });

  // Notify the extension when the page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      chrome.runtime.sendMessage({
        type: 'PAGE_LOADED',
        url: window.location.href,
        nftDetails: extractOpenSeaNFTDetails()
      });
    });
  } else {
    chrome.runtime.sendMessage({
      type: 'PAGE_LOADED',
      url: window.location.href,
      nftDetails: extractOpenSeaNFTDetails()
    });
  }

  // Listen for URL changes (for SPA navigation)
  let currentUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'URL_CHANGED',
          url: window.location.href,
          nftDetails: extractOpenSeaNFTDetails()
        });
      }, 1000); // Wait for page to settle
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})(); 