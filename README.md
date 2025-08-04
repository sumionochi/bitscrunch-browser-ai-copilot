# BitsCrunch Browser AI Copilot 🚀

<div align="center">

<img width="334" height="392" alt="Screenshot 2025-08-04 at 8 26 00 PM" src="https://github.com/user-attachments/assets/d2e5654f-fcbe-4f89-bcb9-e315d91dbda4" />

A powerful Browser integrated Persistent SidePanel for real-time AI Piloted NFT analytics and market insights, powered by BitsCrunch API.
Side-panel · 31 BitsCrunch endpoints · AI copilot for instant insights.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

## 🌟 Features

<img width="1354" height="801" alt="sending" src="https://github.com/user-attachments/assets/c5fc266a-dafb-4259-9ef9-7ed59f07b52f" />

- **Real-time NFT Analytics**: Get instant insights into NFT valuations and market trends
- **Multi-chain Support**: Analytics across different blockchain networks
- **Price Estimation**: Advanced AI-powered price predictions
- **Market Analysis**: Comprehensive market trend analysis
- **Trader Insights**: Detailed trader activity metrics
- **Wash Trade Detection**: Sophisticated wash trading analysis
- **Transaction History**: Complete transaction tracking
- **Collection Analytics**: Collection-wide price analysis
- **Interactive Charts**: Dynamic data visualization
- **Custom Time Ranges**: Flexible time period selection

--

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Browser Extension
        P[Popup UI] --> BG[Background Script]
        SP[Side Panel] --> BG
        CS[Content Script] --> BG
        BG --> API[BitsCrunch API]
    end

    subgraph Components
        NP[NFT Price Card]
        CP[Collection Price Card]
        NT[NFT Transactions]
        NA[NFT Analytics]
        WA[Wallet Analysis]
        CH[Charts]
    end

    BG --> Components
```
<img width="283" height="455" alt="Screenshot 2025-08-04 at 8 31 41 PM" src="https://github.com/user-attachments/assets/91f2f688-2258-4bdf-b241-1e50c5f9a100" />

- **Content Script** grabs NFT details from OpenSea pages.
- **Service Worker** relays data, stores API key (Chrome `storage.local`).
- **React 18 + Vite** renders tabs, queues API calls, caches responses (5-30 min).
- **Tailwind + shadcn/ui + Recharts** for sharp cards & charts.

--

## 🛠️ Technical Stack

<img width="1356" height="813" alt="Screenshot 2025-08-04 at 8 32 26 PM" src="https://github.com/user-attachments/assets/015f5302-2a0a-439d-b7ff-eebab951cfdd" />


- **Frontend Framework**: React 18.3 with TypeScript
- **Build Tool**: Vite 6.0
- **Styling**:
  - Tailwind CSS 3.4
  - shadcn/ui components
  - Radix UI primitives
- **Data Visualization**:
  - Recharts for interactive charts
  - Custom chart components
- **State Management**: React Hooks and Context
- **API Integration**: Axios for data fetching
- **Development**:
  - ESLint 9.17 for code quality
  - TypeScript 5.6 for type safety

<img width="1357" height="815" alt="Screenshot 2025-08-04 at 8 32 36 PM" src="https://github.com/user-attachments/assets/73acef0a-2598-433c-a896-63791090eb5f" />

--

## 📦 Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/bitscrunch-nft-extension.git
```

2. Install dependencies:

```bash
cd bitscrunch-nft-extension
npm install
```

3. Build the extension:

```bash
./build-extension.sh
```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder from your build

--

## 🔧 Project Structure

<img width="1357" height="877" alt="Screenshot 2025-08-04 at 7 33 13 PM" src="https://github.com/user-attachments/assets/c44d1043-c31b-49f9-a840-bcc817c40fb0" />


```plaintext
bitscrunch-nft-extension/
├── src/
│   ├── components/
│   │   ├── Chart.tsx
│   │   ├── NftAnalytics.tsx
│   │   ├── NftPriceCard.tsx
│   │   ├── NftCollectionPriceCard.tsx
│   │   ├── NftTransaction.tsx
│   │   ├── NftTraders.tsx
│   │   ├── WalletAnalysis.tsx
│   │   └── ui/
│   ├── hooks/
│   │   └── useChromeExtension.ts
│   ├── data/
│   │   └── DataLists.ts
│   ├── types/
│   │   └── chrome.d.ts
│   └── App.tsx
├── public/
│   ├── manifest.json
│   ├── background.js
│   └── content-script.js
└── package.json
```

--

## 🔑 API Integration

<img width="1356" height="877" alt="Screenshot 2025-08-04 at 7 34 20 PM" src="https://github.com/user-attachments/assets/a17a44cf-5d70-4ba8-b930-f469727688c5" />


The extension integrates with the UnleashNFTs API for comprehensive NFT analytics: 🔌 BitsCrunch Endpoints Used (31)

| Purpose                                          | Endpoint                                            |
| ------------------------------------------------ | --------------------------------------------------- |
| Blockchains list                                 | `GET /api/v2/blockchains`                           |
| Market trend                                     | `GET /api/v1/market/trend`                          |
| NFT price                                        | `GET /api/v2/nft/liquify/price_estimate`            |
| Collection price                                 | `GET /api/v2/nft/liquify/collection/price_estimate` |
| NFT analytics                                    | `GET /api/v2/nft/analytics`                         |
| NFT scores                                       | `GET /api/v2/nft/scores`                            |
| Holder data                                      | `GET /api/v2/nft/owner`                             |
| NFT washtrade                                    | `GET /api/v2/nft/washtrade`                         |
| NFT traders (snapshot)                           | `GET /api/v2/nft/traders`                           |
| NFT traders (trend)                              | `GET /api/v2/nft/market-insights/traders`           |
| NFT transactions                                 | `GET /api/v2/nft/transactions`                      |
| Chain washtrade trend                            | `GET /api/v2/nft/market-insights/washtrade`         |
| Wallet NFT balance                               | `GET /api/v2/wallet/balance/nft`                    |
| Wallet token balance                             | `GET /api/v2/wallet/balance/token`                  |
| Wallet label                                     | `GET /api/v2/wallet/label`                          |
| Wallet score                                     | `GET /api/v2/wallet/score`                          |
| Wallet metrics                                   | `GET /api/v2/wallet/metrics`                        |
| Wallet NFT analytics                             | `GET /api/v2/nft/wallet/analytics`                  |
| Wallet NFT traders                               | `GET /api/v2/nft/wallet/traders`                    |
| … plus 12 auxiliary paginated /timespan variants |                                                     |

--

## 🔒 Security Notes

- **Keys never leave your device.** BitsCrunch key in `storage.local`; OpenAI key kept in memory per session.
- Strict CSP & host-permissions (`api.unleashnfts.com`, `openai.com`, `opensea.io`).
- No third-party tracking.

--

## 🌐 Browser Support

<img width="1355" height="873" alt="Screenshot 2025-08-04 at 7 35 14 PM" src="https://github.com/user-attachments/assets/46f2d0a3-e5d1-4a1e-b272-7d49473e6fc0" />


- Chrome (v114+)
- Brave (v114+)
- Edge (v114+)
- Other Chromium-based browsers (v114+)

--

## 🗂️ Key React Components

| File                          | Responsibility                   | Main APIs                           |
| ----------------------------- | -------------------------------- | ----------------------------------- |
| `NftPriceCard.tsx`            | Liquify price, AI chat           | price_estimate                      |
| `NftCollectionPriceCard.tsx`  | Collection valuation             | collection/price_estimate           |
| `NftTransaction.tsx`          | Tx table + chart, AI             | transactions                        |
| `NftTraders.tsx`              | Buyer/seller stats, chart        | traders, traders trend              |
| `NftAnalytics.tsx`            | Perf, volume, wash, holder       | analytics, scores, owner, washtrade |
| `WalletAnalysis.tsx`          | Portfolio dashboard, AI          | wallet \* endpoints                 |
| `hooks/useChromeExtension.ts` | Tabs, storage, sidepanel helpers | –                                   |

--

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

--

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

--

## 🙏 Acknowledgments

- Built with [BitsCrunch](https://www.bitscrunch.com/) API
- OpenAI api - gpt-4o-mini
- UI components powered by shadcn/ui
- Charts and visualizations using Recharts
