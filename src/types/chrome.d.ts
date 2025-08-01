// Chrome Extension API Type Definitions

declare global {
  interface Window {
    chrome: typeof chrome;
  }
  
  const chrome: {
    runtime: {
      sendMessage(message: any, callback?: (response: any) => void): void;
      onMessage: {
        addListener(callback: (message: any, sender: any, sendResponse: any) => void): void;
        removeListener(callback: (message: any, sender: any, sendResponse: any) => void): void;
      };
    };
    storage: {
      local: {
        get(keys: string | string[] | object | null): Promise<{ [key: string]: any }>;
        set(items: object): Promise<void>;
      };
    };
    sidePanel?: {
      setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): void;
    };
    tabs: {
      query(queryInfo: any): Promise<any[]>;
      get(tabId: number): Promise<any>;
      onUpdated: {
        addListener(callback: (tabId: number, changeInfo: any, tab: any) => void): void;
      };
      onActivated: {
        addListener(callback: (activeInfo: any) => void): void;
      };
    };
    scripting: {
      executeScript(injection: {
        target: { tabId: number };
        function: () => any;
      }): Promise<any[]>;
    };
  };
}

export {};