import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hardhat, sepolia } from "wagmi/chains";

const configuredChainId = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? hardhat.id,
);

const targetChain = configuredChainId === sepolia.id ? sepolia : hardhat;
const targetChainId = targetChain.id;
const targetChainRpcUrl = targetChain.rpcUrls.default.http[0];

const wagmiConfig =
  targetChain.id === sepolia.id
    ? createConfig({
        chains: [sepolia],
        connectors: [injected({ shimDisconnect: true })],
        transports: {
          [sepolia.id]: http(),
        },
        ssr: true,
      })
    : createConfig({
        chains: [hardhat],
        connectors: [injected({ shimDisconnect: true })],
        transports: {
          [hardhat.id]: http(hardhat.rpcUrls.default.http[0]),
        },
        ssr: true,
      });

export { targetChain, targetChainId, targetChainRpcUrl, wagmiConfig };
