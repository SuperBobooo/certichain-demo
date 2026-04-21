"use client";

import { useState } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
  type Eip1193Provider,
} from "ethers";
import { useAccount, useChainId } from "wagmi";
import abi from "../abi/certiChain.json";
import { targetChain, targetChainId, targetChainRpcUrl } from "../lib/wallet";

type IssueCertificateInput = {
  certificateId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  metadataHash: string;
};

type VerifyCertificateInput = {
  certificateId: string;
  metadataHash: string;
};

type CertificateDetails = {
  certificateId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  metadataHash: string;
  issuerWallet: string;
  issueTime: number;
  isValid: boolean;
};

type IssueStage = "idle" | "waiting_wallet" | "pending_confirmation" | "success";

type IssueCertificateResult = {
  certificate: CertificateDetails;
  chainId: number;
  chainName: string;
  transactionHash: string;
};

type VerificationResult = {
  isValid: boolean;
  certificate: CertificateDetails | null;
};

const contractAddress = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

const getInjectedProvider = () =>
  typeof window === "undefined"
    ? undefined
    : (window as Window & { ethereum?: Eip1193Provider }).ethereum;

const normalizeMetadataText = (metadataText: string) =>
  metadataText.trim().replace(/\r\n/g, "\n");

const hashCertificateMetadata = (metadataText: string) => {
  const normalizedMetadata = normalizeMetadataText(metadataText);

  if (!normalizedMetadata) {
    return "";
  }

  // Demo storage rule: hash normalized metadata locally, then anchor only the hash on-chain.
  return keccak256(toUtf8Bytes(normalizedMetadata));
};

const getReadableErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    shortMessage?: string;
    reason?: string;
    message?: string;
    info?: { error?: { message?: string } };
  };

  const message =
    candidate.shortMessage ??
    candidate.reason ??
    candidate.info?.error?.message ??
    candidate.message ??
    fallback;

  return message.replace("execution reverted: ", "");
};

const getReadContract = () => {
  if (!contractAddress) {
    throw new Error(
      "Missing NEXT_PUBLIC_CONTRACT_ADDRESS. Deploy CertiChain and set the frontend env file first.",
    );
  }

  const provider = new JsonRpcProvider(targetChainRpcUrl);
  return new Contract(contractAddress, abi, provider);
};

const getWriteContract = async (address?: `0x${string}`) => {
  const ethereum = getInjectedProvider();

  if (!contractAddress || !ethereum) {
    throw new Error(
      "MetaMask or NEXT_PUBLIC_CONTRACT_ADDRESS is unavailable for transactions.",
    );
  }

  const provider = new BrowserProvider(ethereum);
  const signer = address
    ? await provider.getSigner(address)
    : await provider.getSigner();

  return new Contract(contractAddress, abi, signer);
};

const toCertificateDetails = (
  certificateResponse: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    bigint,
    boolean,
  ],
): CertificateDetails => ({
  certificateId: certificateResponse[0],
  recipientName: certificateResponse[1],
  courseName: certificateResponse[2],
  issuerName: certificateResponse[3],
  metadataHash: certificateResponse[4],
  issuerWallet: certificateResponse[5],
  issueTime: Number(certificateResponse[6]),
  isValid: certificateResponse[7],
});

const useCertiChain = () => {
  const { address } = useAccount();
  const chainId = useChainId();
  const isWrongNetwork = Boolean(address) && chainId !== targetChainId;
  const [issueLoading, setIssueLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [issueStage, setIssueStage] = useState<IssueStage>("idle");
  const [issueTransactionHash, setIssueTransactionHash] = useState<
    string | null
  >(null);

  const resetIssueState = () => {
    setIssueError(null);
    setIssueStage("idle");
    setIssueTransactionHash(null);
  };

  const getCertificate = async (
    certificateId: string,
  ): Promise<CertificateDetails> => {
    const contract = getReadContract();
    const certificate = (await contract.getCertificate(certificateId)) as [
      string,
      string,
      string,
      string,
      string,
      string,
      bigint,
      boolean,
    ];

    return toCertificateDetails(certificate);
  };

  const issueCertificate = async (
    input: IssueCertificateInput,
  ): Promise<IssueCertificateResult> => {
    if (!address) {
      const message = "Connect MetaMask before issuing a certificate.";
      setIssueError(message);
      throw new Error(message);
    }

    if (isWrongNetwork) {
      const message = `Switch MetaMask to ${targetChain.name} (${targetChainId}) before issuing.`;
      setIssueError(message);
      throw new Error(message);
    }

    setIssueLoading(true);
    setIssueError(null);
    setIssueStage("waiting_wallet");
    setIssueTransactionHash(null);

    try {
      const contract = await getWriteContract(address);
      const tx = await contract.issueCertificate(
        input.certificateId,
        input.recipientName,
        input.courseName,
        input.issuerName,
        input.metadataHash,
      );

      const submittedTxHash = tx.hash as string;
      setIssueTransactionHash(submittedTxHash);
      setIssueStage("pending_confirmation");

      const receipt = await tx.wait();
      const certificate = await getCertificate(input.certificateId);

      setIssueStage("success");

      return {
        certificate,
        chainId: targetChainId,
        chainName: `${targetChain.name} (${targetChainId})`,
        transactionHash: receipt?.hash ?? submittedTxHash,
      };
    } catch (error) {
      const message = getReadableErrorMessage(
        error,
        "Unable to issue the certificate on chain.",
      );
      setIssueError(message);
      setIssueStage("idle");
      throw error;
    } finally {
      setIssueLoading(false);
    }
  };

  const verifyCertificate = async (
    input: VerifyCertificateInput,
  ): Promise<VerificationResult> => {
    setVerifyLoading(true);
    setVerifyError(null);

    try {
      const contract = getReadContract();
      const isValid = (await contract.verifyCertificate(
        input.certificateId,
        input.metadataHash,
      )) as boolean;

      if (!isValid) {
        return { isValid: false, certificate: null };
      }

      const certificate = await getCertificate(input.certificateId);

      return {
        isValid,
        certificate,
      };
    } catch (error) {
      const message = getReadableErrorMessage(
        error,
        "Unable to reach the CertiChain contract for verification.",
      );
      setVerifyError(message);
      throw error;
    } finally {
      setVerifyLoading(false);
    }
  };

  return {
    address,
    chainId,
    contractAddress,
    getCertificate,
    isWrongNetwork,
    issueCertificate,
    issueError,
    issueLoading,
    issueStage,
    issueTransactionHash,
    resetIssueState,
    targetChainName: `${targetChain.name} (${targetChainId})`,
    verifyCertificate,
    verifyError,
    verifyLoading,
  };
};

export type {
  CertificateDetails,
  IssueCertificateInput,
  IssueCertificateResult,
  IssueStage,
  VerificationResult,
  VerifyCertificateInput,
};
export { hashCertificateMetadata, useCertiChain };
