"use client";

import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { Wrapper } from "./Wrapper";
import { targetChainId } from "../lib/wallet";

const shortenAddress = (address: `0x${string}`) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

const Header = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const injectedConnector = connectors[0];

  return (
    <header className="py-8 border-b mb-10">
      <Wrapper>
        <div className="flex items-center justify-between">
          <h1 className="text-lg md:text-xl font-bold">
            Solidity Next.js Starter
          </h1>
          <div className="flex items-center gap-3">
            {isConnected && address && (
              <p className="text-sm text-gray-500">
                {shortenAddress(address)} on {chainId}
                {chainId === targetChainId ? "" : " (wrong network)"}
              </p>
            )}
            {!isConnected ? (
              <button
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded-md"
                onClick={() =>
                  injectedConnector &&
                  connect({ connector: injectedConnector })
                }
                disabled={!injectedConnector || isPending}
              >
                {isPending ? "Connecting..." : "Connect MetaMask"}
              </button>
            ) : (
              <button
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-4 rounded-md"
                onClick={() => disconnect()}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </Wrapper>
    </header>
  );
};

export { Header };
