"use client";

import { useEffect, useState } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  type Eip1193Provider,
} from "ethers";
import { useAccount, useChainId } from "wagmi";
import abi from "../abi/greeter.json";
import { targetChain, targetChainId, targetChainRpcUrl } from "../lib/wallet";

const contractAddress = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

const getInjectedProvider = () =>
  typeof window === "undefined"
    ? undefined
    : (window as Window & { ethereum?: Eip1193Provider }).ethereum;

const readGreetingFromContract = async () => {
  if (!contractAddress) {
    throw new Error("Missing NEXT_PUBLIC_CONTRACT_ADDRESS");
  }

  const provider = new JsonRpcProvider(targetChainRpcUrl);
  const contract = new Contract(contractAddress, abi, provider);

  return (await contract.getGreeting()) as string;
};

const useGreeting = ({
  newGreeting,
  onSetGreetingSuccess,
}: {
  newGreeting?: string;
  onSetGreetingSuccess?: () => void;
}): {
  address: `0x${string}` | undefined;
  isWrongNetwork: boolean;
  targetChainName: string;
  greeting: string | null;
  getGreetingLoading: boolean;
  getGreetingError: boolean;
  setGreeting: (() => Promise<void>) | undefined;
  setGreetingLoading: boolean;
  setGreetingError: boolean;
} => {
  const { address } = useAccount();
  const chainId = useChainId();
  const isWrongNetwork = Boolean(address) && chainId !== targetChainId;
  const [greeting, setGreetingValue] = useState<string | null>(null);
  const [getGreetingLoading, setGetGreetingLoading] = useState(true);
  const [getGreetingError, setGetGreetingError] = useState(false);
  const [setGreetingLoading, setSetGreetingLoading] = useState(false);
  const [setGreetingError, setSetGreetingError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadGreeting = async () => {
      setGetGreetingLoading(true);
      setGetGreetingError(false);

      try {
        const nextGreeting = await readGreetingFromContract();

        if (!cancelled) {
          setGreetingValue(nextGreeting);
        }
      } catch {
        if (!cancelled) {
          setGreetingValue(null);
          setGetGreetingError(true);
        }
      } finally {
        if (!cancelled) {
          setGetGreetingLoading(false);
        }
      }
    };

    void loadGreeting();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    address,
    isWrongNetwork,
    targetChainName: `${targetChain.name} (${targetChain.id})`,
    greeting,
    getGreetingLoading,
    getGreetingError,
    setGreeting: isWrongNetwork
      ? undefined
      : async () => {
          const ethereum = getInjectedProvider();

          if (!contractAddress || !newGreeting || !ethereum) {
            setSetGreetingError(true);
            return;
          }

          setSetGreetingLoading(true);
          setSetGreetingError(false);

          try {
            const provider = new BrowserProvider(ethereum);
            const signer = address
              ? await provider.getSigner(address)
              : await provider.getSigner();
            const contract = new Contract(contractAddress, abi, signer);
            const tx = await contract.setGreeting(newGreeting);

            await tx.wait();

            const nextGreeting = await readGreetingFromContract();
            setGreetingValue(nextGreeting);
            setGetGreetingError(false);
            onSetGreetingSuccess?.();
          } catch {
            setSetGreetingError(true);
          } finally {
            setSetGreetingLoading(false);
          }
        },
    setGreetingError,
  };
};

export { useGreeting };
