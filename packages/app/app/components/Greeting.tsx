"use client";

import { useState, useRef, useEffect } from "react";
import { useGreeting } from "../hooks/useGreeting";
import { toast } from "react-toastify";
import { useConnect, useSwitchChain } from "wagmi";
import { targetChainId } from "../lib/wallet";

const Greeting = () => {
  const [newGreeting, setNewGreeting] = useState<string>("");
  const newGreetingInputRef = useRef<HTMLInputElement>(null);

  const onSetGreetingSuccess = () => {
    toast.success(`Successfully set your new greeting`, {
      position: toast.POSITION.BOTTOM_CENTER,
      autoClose: 3000,
      hideProgressBar: true,
      closeOnClick: true,
      pauseOnHover: true,
      theme: "light",
      className: "text-sm",
    });
    setNewGreeting("");
    newGreetingInputRef.current?.blur();
  };

  const {
    address,
    isWrongNetwork,
    targetChainName,
    greeting,
    getGreetingLoading,
    getGreetingError,
    setGreeting,
    setGreetingLoading,
    setGreetingError,
  } = useGreeting({ newGreeting, onSetGreetingSuccess });

  useEffect(() => {
    if (!address) {
      setNewGreeting("");
    }
  }, [address]);

  const { connect, connectors, isPending: isConnecting } = useConnect();
  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();
  const injectedConnector = connectors[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col space-y-4">
        <p className="text-sm text-gray-500 text-center">
          Greeting from the blockchain:
        </p>
        {getGreetingLoading ? (
          <p className="text-lg text-center text-gray-500 italic">Loading...</p>
        ) : (
          <p
            className={
              !getGreetingError
                ? `text-lg text-center`
                : `text-lg text-center text-red-500`
            }
          >
            {!getGreetingError
              ? greeting
              : `There was an error getting the greeting`}
          </p>
        )}
      </div>
      <div className="space-y-8">
        <div className="flex flex-col space-y-4">
          <input
            className="border p-4 text-center"
            onChange={(e) => setNewGreeting(e.target.value)}
            placeholder="Write a new greeting"
            ref={newGreetingInputRef}
            disabled={!address || isWrongNetwork}
            value={newGreeting}
          />
          <button
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 px-8 rounded-md"
            onClick={setGreeting}
            disabled={
              !address ||
              isWrongNetwork ||
              !newGreeting ||
              setGreetingLoading
            }
          >
            {!setGreetingLoading
              ? `Set your new greeting on the blockchain`
              : `Setting greeting...`}
          </button>
          {address && isWrongNetwork && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-center space-y-3">
              <p className="text-sm text-amber-800">
                Current wallet network does not match {targetChainName}. Switch
                MetaMask to continue the local demo.
              </p>
              <button
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-6 rounded-md"
                onClick={() => switchChain({ chainId: targetChainId })}
                disabled={isSwitchingChain}
              >
                {!isSwitchingChain
                  ? `Switch to ${targetChainName}`
                  : `Switching network...`}
              </button>
              {switchChainError && (
                <p className="text-sm text-red-500">
                  Automatic network switch failed. In MetaMask, manually select
                  or add {targetChainName} and try again.
                </p>
              )}
            </div>
          )}
          {!address && (
            <button
              className="text-sm text-gray-500 text-center underline hover:opacity-80"
              onClick={() =>
                injectedConnector && connect({ connector: injectedConnector })
              }
              disabled={!injectedConnector || isConnecting}
            >
              {isConnecting
                ? "Connecting MetaMask..."
                : "Connect MetaMask to set a new greeting"}
            </button>
          )}
          {address && isWrongNetwork && (
            <p className="text-sm text-gray-500 text-center">
              Contract reads stay on the configured chain, but writes are
              disabled until MetaMask switches to {targetChainName}.
            </p>
          )}
          {address && !isWrongNetwork && !newGreeting && (
            <p className="text-sm text-gray-500 text-center">
              Type something to set a new greeting
            </p>
          )}
          {setGreetingError && (
            <p className="text-sm text-red-500 text-center">
              There was an error setting your new greeting
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export { Greeting };
