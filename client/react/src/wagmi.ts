import { createConfig, http } from 'wagmi'
import {
  mainnet, sepolia,
  base, baseSepolia,
  optimism, optimismSepolia,
  arbitrum, arbitrumSepolia,
  polygon, polygonAmoy,
  avalanche, avalancheFuji,
  linea, lineaSepolia,
  zkSync, zkSyncSepoliaTestnet
} from 'wagmi/chains'

declare module 'wagmi' {
  interface Register {
    config: typeof WagmiConfig
  }
}

export const WagmiConfig = createConfig({
  chains: [
    mainnet, sepolia,
    base, baseSepolia,
    optimism, optimismSepolia,
    arbitrum, arbitrumSepolia,
    polygon, polygonAmoy,
    avalanche, avalancheFuji,
    linea, lineaSepolia,
    zkSync, zkSyncSepoliaTestnet
  ],
  transports: {
    [mainnet.id]: http(), [sepolia.id]: http(),
    [base.id]: http(), [baseSepolia.id]: http(),
    [optimism.id]: http(), [optimismSepolia.id]: http(),
    [arbitrum.id]: http(), [arbitrumSepolia.id]: http(),
    [polygon.id]: http(), [polygonAmoy.id]: http(),
    [avalanche.id]: http(), [avalancheFuji.id]: http(),
    [linea.id]: http(), [lineaSepolia.id]: http(),
    [zkSync.id]: http(), [zkSyncSepoliaTestnet.id]: http(),
  },
  ssr: true,
})

export type SupportedChainId = typeof WagmiConfig.chains[number]['id'];
