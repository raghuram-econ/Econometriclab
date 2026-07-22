import { runOLS } from '../lib/econometrics/ols';

self.onmessage = (e: MessageEvent) => {
  try {
    const { 
      data, 
      yVar, 
      xVars, 
      includeIntercept, 
      robust, 
      clusterVar, 
      bootstrap, 
      robustType, 
      useWildBootstrap, 
      wildBootstrapB 
    } = e.data;
    
    // Run the full estimation, which includes wildBootstrapClusteredSE
    const results = runOLS(
      data, 
      yVar, 
      xVars, 
      includeIntercept, 
      robust, 
      clusterVar, 
      bootstrap, 
      true, 
      robustType, 
      useWildBootstrap, 
      wildBootstrapB
    );
    
    self.postMessage({ success: true, results });
  } catch (error: any) {
    self.postMessage({ success: false, error: error.message || "Failed to run estimation" });
  }
};
