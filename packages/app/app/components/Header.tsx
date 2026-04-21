"use client";

import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { Wrapper } from "./Wrapper";
import { targetChain, targetChainId } from "../lib/wallet";

const shortenAddress = (address: `0x${string}`) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

const Header = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const injectedConnector = connectors[0];

  return (
    <header className="sticky top-0 z-20 border-b border-white/70 bg-white/70 backdrop-blur-xl">
      <Wrapper>
        <div className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
              Blockchain Classroom Demo
            </p>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                CertiChain
              </h1>
              <p className="text-sm text-slate-600">
                Certificate issuance and verification on a local Ethereum demo
                network
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {isConnected && address && (
              <div className="rounded-full border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  {shortenAddress(address)}
                </p>
                <p className="text-xs text-slate-500">
                  Chain ID {chainId}
                  {chainId === targetChainId
                    ? ` • ${targetChain.name}`
                    : ` • switch to ${targetChainId}`}
                </p>
              </div>
            )}
            {!isConnected ? (
              <button
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
