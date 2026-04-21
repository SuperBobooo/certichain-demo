"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useConnect, useSwitchChain } from "wagmi";
import {
  hashCertificateMetadata,
  type CertificateDetails,
  type IssueStage,
  type VerificationResult,
  useCertiChain,
} from "../hooks/useCertiChain";
import { targetChainId } from "../lib/wallet";

type IssueFormState = {
  certificateId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  metadataText: string;
};

type VerifyFormState = {
  certificateId: string;
  metadataText: string;
};

type FieldErrors<T> = Partial<Record<keyof T, string>>;

type LatestIssuedSnapshot = {
  certificate: CertificateDetails;
  metadataText: string;
  chainName: string;
  transactionHash: string;
  storedAt: number;
};

type VerificationPanelState = VerificationResult & {
  certificateId: string;
  metadataHash: string;
  checkedAt: number;
};

type ProgressState = "pending" | "active" | "done";

const initialIssueForm: IssueFormState = {
  certificateId: "",
  recipientName: "",
  courseName: "",
  issuerName: "",
  metadataText: "",
};

const initialVerifyForm: VerifyFormState = {
  certificateId: "",
  metadataText: "",
};

const sampleIssueForm: IssueFormState = {
  certificateId: "CERT-2026-001",
  recipientName: "Alice Zhang",
  courseName: "Blockchain Fundamentals Bootcamp",
  issuerName: "CertiChain Academy",
  metadataText: `Recipient: Alice Zhang
Program: Blockchain Fundamentals Bootcamp
Completion Date: 2026-04-16
Credential Level: Distinction
Verifier: CertiChain Academy`,
};

const latestIssuedStorageKey = "certichain.latest-issued-certificate";

const demoFlow = [
  "Fill certificate data",
  "Generate metadata hash",
  "Issue on chain",
  "Verify authenticity",
];

const truncateMiddle = (value: string, start = 10, end = 8) =>
  value.length <= start + end + 3
    ? value
    : `${value.slice(0, start)}...${value.slice(-end)}`;

const formatIssueTime = (issueTime: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(issueTime * 1000));

const formatPanelTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));

const validateIssueForm = (
  form: IssueFormState,
): FieldErrors<IssueFormState> => {
  const errors: FieldErrors<IssueFormState> = {};

  if (!form.certificateId.trim()) {
    errors.certificateId = "Certificate ID is required.";
  } else if (form.certificateId.trim().length < 6) {
    errors.certificateId =
      "Use at least 6 characters so the demo record is easy to identify.";
  }

  if (!form.recipientName.trim()) {
    errors.recipientName = "Recipient name is required.";
  }

  if (!form.courseName.trim()) {
    errors.courseName = "Course / achievement name is required.";
  }

  if (!form.issuerName.trim()) {
    errors.issuerName = "Issuer name is required.";
  }

  if (!form.metadataText.trim()) {
    errors.metadataText =
      "Metadata text is required to compute the on-chain hash.";
  }

  return errors;
};

const validateVerifyForm = (
  form: VerifyFormState,
): FieldErrors<VerifyFormState> => {
  const errors: FieldErrors<VerifyFormState> = {};

  if (!form.certificateId.trim()) {
    errors.certificateId = "Certificate ID is required.";
  } else if (form.certificateId.trim().length < 6) {
    errors.certificateId = "Use the full certificate ID before verifying.";
  }

  if (!form.metadataText.trim()) {
    errors.metadataText =
      "Metadata text is required so the same hash can be reproduced locally.";
  }

  return errors;
};

const getIssueProgressState = (
  step: "wallet" | "submitted" | "confirmation" | "success",
  issueStage: IssueStage,
  issueTransactionHash: string | null,
): ProgressState => {
  if (step === "wallet") {
    if (issueStage === "waiting_wallet") {
      return "active";
    }

    if (
      issueStage === "pending_confirmation" ||
      issueStage === "success" ||
      issueTransactionHash
    ) {
      return "done";
    }
  }

  if (step === "submitted") {
    return issueTransactionHash ? "done" : "pending";
  }

  if (step === "confirmation") {
    if (issueStage === "pending_confirmation") {
      return "active";
    }

    if (issueStage === "success") {
      return "done";
    }
  }

  if (step === "success") {
    return issueStage === "success" ? "done" : "pending";
  }

  return "pending";
};

const CopyButton = ({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Unable to copy in this browser.");
    }
  };

  return (
    <button
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
      type="button"
      onClick={handleCopy}
    >
      {label}
    </button>
  );
};

const SectionHeader = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) => (
  <div className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
      {eyebrow}
    </p>
    <div className="space-y-2">
      <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
        {title}
      </h3>
      <p className="text-sm leading-6 text-slate-600">{description}</p>
    </div>
  </div>
);

const DetailRow = ({
  label,
  value,
  mono = false,
  copyValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
}) => (
  <div className="space-y-2 rounded-2xl border border-slate-100 bg-white/70 p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      {copyValue && <CopyButton value={copyValue} />}
    </div>
    <p
      className={`text-sm text-slate-700 ${
        mono ? "break-all font-mono text-[13px]" : ""
      }`}
    >
      {value}
    </p>
  </div>
);

const FieldErrorText = ({ message }: { message?: string }) =>
  message ? <p className="mt-2 text-xs text-rose-600">{message}</p> : null;

const ResultPlaceholder = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
    <p className="font-medium text-slate-700">{title}</p>
    <p className="mt-2 leading-6">{description}</p>
  </div>
);

const ProgressItem = ({
  label,
  state,
}: {
  label: string;
  state: ProgressState;
}) => (
  <div className="flex items-center gap-3">
    <span
      className={`h-3 w-3 rounded-full ${
        state === "done"
          ? "bg-emerald-500"
          : state === "active"
            ? "bg-amber-500 ring-4 ring-amber-100"
            : "bg-slate-200"
      }`}
    />
    <p
      className={`text-sm ${
        state === "pending" ? "text-slate-500" : "text-slate-800"
      }`}
    >
      {label}
    </p>
  </div>
);

const CertiChainDemo = () => {
  const [issueForm, setIssueForm] = useState<IssueFormState>(initialIssueForm);
  const [verifyForm, setVerifyForm] = useState<VerifyFormState>(initialVerifyForm);
  const [issueErrors, setIssueErrors] = useState<FieldErrors<IssueFormState>>(
    {},
  );
  const [verifyErrors, setVerifyErrors] = useState<FieldErrors<VerifyFormState>>(
    {},
  );
  const [latestIssued, setLatestIssued] =
    useState<LatestIssuedSnapshot | null>(null);
  const [verificationPanel, setVerificationPanel] =
    useState<VerificationPanelState | null>(null);

  const issueMetadataHash = hashCertificateMetadata(issueForm.metadataText);
  const verifyMetadataHash = hashCertificateMetadata(verifyForm.metadataText);

  const {
    address,
    chainId,
    contractAddress,
    isWrongNetwork,
    issueCertificate,
    issueError,
    issueLoading,
    issueStage,
    issueTransactionHash,
    resetIssueState,
    targetChainName,
    verifyCertificate,
    verifyError,
    verifyLoading,
  } = useCertiChain();

  const { connect, connectors, isPending: isConnecting } = useConnect();
  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();

  const injectedConnector = connectors[0];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Persist the latest successful issuance locally so a page refresh does not
    // erase the classroom demo state before a backend or chain-driven history exists.
    const stored = window.localStorage.getItem(latestIssuedStorageKey);

    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as LatestIssuedSnapshot;

      if (parsed?.certificate?.certificateId) {
        setLatestIssued(parsed);
      }
    } catch {
      window.localStorage.removeItem(latestIssuedStorageKey);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!latestIssued) {
      return;
    }

    window.localStorage.setItem(
      latestIssuedStorageKey,
      JSON.stringify(latestIssued),
    );
  }, [latestIssued]);

  const issueStatusTitle = issueError
    ? "Issuance failed"
    : issueStage === "waiting_wallet"
      ? "Waiting for wallet confirmation"
      : issueStage === "pending_confirmation"
        ? "Waiting for block confirmation"
        : issueStage === "success"
          ? "Certificate issued successfully"
          : "Ready to issue";

  const issueStatusDescription = issueError
    ? issueError
    : issueStage === "waiting_wallet"
      ? "Confirm the transaction in MetaMask to submit the certificate record."
      : issueStage === "pending_confirmation"
        ? "The transaction is on its way to the next block. Once confirmed, the latest-issued panel will refresh."
        : issueStage === "success"
          ? "The certificate record is now anchored on chain and available for verification."
          : "Fill the form, generate a metadata hash, preview the record, then issue it on chain.";

  const handleIssueFieldChange = (
    field: keyof IssueFormState,
    value: string,
  ) => {
    setIssueForm((current) => ({
      ...current,
      [field]: value,
    }));

    setIssueErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const handleVerifyFieldChange = (
    field: keyof VerifyFormState,
    value: string,
  ) => {
    setVerifyForm((current) => ({
      ...current,
      [field]: value,
    }));

    setVerifyErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const handleUseSampleData = () => {
    setIssueForm(sampleIssueForm);
    setIssueErrors({});
    resetIssueState();
  };

  const handleLoadLatestIntoVerify = () => {
    if (!latestIssued) {
      return;
    }

    setVerifyForm({
      certificateId: latestIssued.certificate.certificateId,
      metadataText: latestIssued.metadataText,
    });
    setVerifyErrors({});
    toast.success("Latest issued certificate loaded into the verify form.");
  };

  const handleIssueSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateIssueForm(issueForm);
    setIssueErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      toast.error("Complete the required certificate fields before issuing.");
      return;
    }

    if (!issueMetadataHash) {
      toast.error("Metadata hash could not be generated from the current text.");
      return;
    }

    try {
      const result = await issueCertificate({
        certificateId: issueForm.certificateId.trim(),
        recipientName: issueForm.recipientName.trim(),
        courseName: issueForm.courseName.trim(),
        issuerName: issueForm.issuerName.trim(),
        metadataHash: issueMetadataHash,
      });

      const nextLatestIssued: LatestIssuedSnapshot = {
        certificate: result.certificate,
        metadataText: issueForm.metadataText.trim(),
        chainName: result.chainName,
        transactionHash: result.transactionHash,
        storedAt: Date.now(),
      };

      setLatestIssued(nextLatestIssued);
      setIssueForm(initialIssueForm);
      setIssueErrors({});
      toast.success("Certificate issued on chain.");
    } catch {
      toast.error("Certificate issuance failed.");
    }
  };

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateVerifyForm(verifyForm);
    setVerifyErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      toast.error("Complete the certificate ID and metadata text before verifying.");
      return;
    }

    if (!verifyMetadataHash) {
      toast.error("Metadata hash could not be generated from the current text.");
      return;
    }

    try {
      const result = await verifyCertificate({
        certificateId: verifyForm.certificateId.trim(),
        metadataHash: verifyMetadataHash,
      });

      setVerificationPanel({
        ...result,
        certificateId: verifyForm.certificateId.trim(),
        metadataHash: verifyMetadataHash,
        checkedAt: Date.now(),
      });

      if (result.isValid) {
        toast.success("Certificate verified successfully.");
      } else {
        toast.error("Certificate verification returned INVALID.");
      }
    } catch {
      toast.error("Unable to verify the certificate.");
    }
  };

  const walletCardValue = address ? truncateMiddle(address, 10, 6) : "Disconnected";
  const chainStatusValue = address
    ? chainId === targetChainId
      ? targetChainName
      : `Unsupported / different network (${chainId})`
    : targetChainName;
  const contractCardValue = contractAddress
    ? truncateMiddle(contractAddress, 10, 6)
    : "Not configured";

  return (
    <div className="space-y-8 pb-16">
      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <article className="panel-shadow relative overflow-hidden rounded-[34px] border border-white/70 bg-white/82 p-8 backdrop-blur-xl md:p-10">
          <div className="pointer-events-none absolute -right-12 top-0 h-44 w-44 rounded-full bg-emerald-200/60 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-44 w-44 rounded-full bg-sky-200/70 blur-3xl" />
          <div className="relative space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">
              Course Demo Prototype
            </p>
            <div className="space-y-4">
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                CertiChain
              </h2>
              <p className="max-w-3xl text-lg text-slate-700 md:text-xl">
                Tamper-resistant certificate issuance and verification powered
                by blockchain
              </p>
              <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                Educational certificates, training proofs, competition awards,
                and internship records are easy to fake when they exist only as
                PDFs or screenshots. CertiChain uses a blockchain record as a
                trust anchor: the original metadata stays off-chain, while a
                reproducible hash is anchored on-chain for later authenticity
                checks.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Wallet Address
                  </p>
                  {address && <CopyButton value={address} />}
                </div>
                <p className="mt-3 text-sm text-slate-900">{walletCardValue}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {address
                    ? "MetaMask is connected for write operations."
                    : "Connect MetaMask to issue certificate records."}
                </p>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Chain Status
                </p>
                <p className="mt-3 text-sm text-slate-900">
                  {chainStatusValue}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {address
                    ? `Wallet chain ID: ${chainId}`
                    : `Target demo network: ${targetChainName}`}
                </p>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Contract Address
                  </p>
                  {contractAddress && <CopyButton value={contractAddress} />}
                </div>
                <p className="mt-3 text-sm text-slate-900">
                  {contractCardValue}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {contractAddress
                    ? "Reads and writes target the deployed CertiChain contract."
                    : "Set NEXT_PUBLIC_CONTRACT_ADDRESS before running the demo."}
                </p>
              </div>
            </div>
          </div>
        </article>

        <aside className="panel-shadow rounded-[34px] border border-white/70 bg-white/82 p-8 backdrop-blur-xl">
          <SectionHeader
            eyebrow="Demo Flow"
            title="How the classroom demo works"
            description="Use this as a simple four-step narrative when presenting the prototype."
          />
          <div className="mt-6 space-y-4">
            {demoFlow.map((step, index) => (
              <div
                key={step}
                className="flex items-start gap-4 rounded-[24px] border border-slate-100 bg-slate-50/80 p-4"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{step}</p>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    {index === 0 &&
                      "Start with a certificate-like record that looks familiar to students."}
                    {index === 1 &&
                      "The browser computes a metadata hash locally so the raw text is not written to chain."}
                    {index === 2 &&
                      "MetaMask signs and sends the issuance transaction to the local Hardhat network."}
                    {index === 3 &&
                      "Recreate the same hash later to prove the record still matches the on-chain anchor."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8">
          <SectionHeader
            eyebrow="Main Function"
            title="Issue Certificate"
            description="Prepare the record, inspect the generated hash, preview the certificate, then issue the proof on chain."
          />

          {!contractAddress && (
            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
              Deploy CertiChain locally and set `NEXT_PUBLIC_CONTRACT_ADDRESS`
              before issuing certificates.
            </div>
          )}

          {!address && (
            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm text-slate-700">
                MetaMask is required for certificate issuance because this
                action sends a transaction.
              </p>
              <button
                className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                  injectedConnector &&
                  connect({ connector: injectedConnector })
                }
                disabled={!injectedConnector || isConnecting}
                type="button"
              >
                {isConnecting ? "Connecting MetaMask..." : "Connect MetaMask"}
              </button>
            </div>
          )}

          {address && isWrongNetwork && (
            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4">
              <p className="text-sm text-amber-900">
                MetaMask is on the wrong network. Switch to {targetChainName} to
                issue certificates on the demo chain.
              </p>
              <button
                className="mt-4 rounded-full bg-amber-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => switchChain({ chainId: targetChainId })}
                disabled={isSwitchingChain}
                type="button"
              >
                {isSwitchingChain
                  ? "Switching Network..."
                  : `Switch to ${targetChainName}`}
              </button>
              {switchChainError && (
                <p className="mt-3 text-sm text-rose-600">
                  Automatic switching failed. Select {targetChainName} manually
                  in MetaMask and try again.
                </p>
              )}
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleIssueSubmit}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Need a quick classroom example?
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Use sample data to instantly populate a ready-to-demo
                  certificate record.
                </p>
              </div>
              <button
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                type="button"
                onClick={handleUseSampleData}
              >
                Use Sample Data
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Certificate ID
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.certificateId}
                  onChange={(event) =>
                    handleIssueFieldChange("certificateId", event.target.value)
                  }
                  placeholder="CERT-2026-001"
                />
                <FieldErrorText message={issueErrors.certificateId} />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Recipient Name
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.recipientName}
                  onChange={(event) =>
                    handleIssueFieldChange("recipientName", event.target.value)
                  }
                  placeholder="Alice Zhang"
                />
                <FieldErrorText message={issueErrors.recipientName} />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Course / Achievement Name
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.courseName}
                  onChange={(event) =>
                    handleIssueFieldChange("courseName", event.target.value)
                  }
                  placeholder="Blockchain Fundamentals Bootcamp"
                />
                <FieldErrorText message={issueErrors.courseName} />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Issuer Name
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.issuerName}
                  onChange={(event) =>
                    handleIssueFieldChange("issuerName", event.target.value)
                  }
                  placeholder="CertiChain Academy"
                />
                <FieldErrorText message={issueErrors.issuerName} />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Metadata Text
              </span>
              <textarea
                className="mt-2 min-h-[158px] w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                value={issueForm.metadataText}
                onChange={(event) =>
                  handleIssueFieldChange("metadataText", event.target.value)
                }
                placeholder={`Recipient: Alice Zhang
Program: Blockchain Fundamentals Bootcamp
Completion Date: 2026-04-16`}
              />
              <FieldErrorText message={issueErrors.metadataText} />
            </label>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Computed Metadata Hash
                  </p>
                  {issueMetadataHash && <CopyButton value={issueMetadataHash} />}
                </div>
                <p className="mt-3 break-all font-mono text-[13px] text-slate-700">
                  {issueMetadataHash ||
                    "Type metadata text to compute the hash locally in the browser."}
                </p>
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  The full metadata stays off-chain in this demo. Only the hash
                  becomes the immutable blockchain anchor.
                </p>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Certificate Preview
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <p>
                    <span className="font-medium text-slate-900">ID:</span>{" "}
                    {issueForm.certificateId.trim() || "Pending input"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Recipient:</span>{" "}
                    {issueForm.recipientName.trim() || "Pending input"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Course:</span>{" "}
                    {issueForm.courseName.trim() || "Pending input"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Issuer:</span>{" "}
                    {issueForm.issuerName.trim() || "Pending input"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">
                      Metadata Hash:
                    </span>{" "}
                    {issueMetadataHash
                      ? truncateMiddle(issueMetadataHash, 12, 10)
                      : "Pending input"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {issueStatusTitle}
                  </p>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    {issueStatusDescription}
                  </p>
                </div>
                {issueTransactionHash && (
                  <CopyButton value={issueTransactionHash} label="Copy Tx Hash" />
                )}
              </div>

              <div className="mt-5 space-y-3">
                <ProgressItem
                  label="Waiting for wallet confirmation"
                  state={getIssueProgressState(
                    "wallet",
                    issueStage,
                    issueTransactionHash,
                  )}
                />
                <ProgressItem
                  label="Transaction submitted"
                  state={getIssueProgressState(
                    "submitted",
                    issueStage,
                    issueTransactionHash,
                  )}
                />
                <ProgressItem
                  label="Waiting for block confirmation"
                  state={getIssueProgressState(
                    "confirmation",
                    issueStage,
                    issueTransactionHash,
                  )}
                />
                <ProgressItem
                  label="Certificate issued successfully"
                  state={getIssueProgressState(
                    "success",
                    issueStage,
                    issueTransactionHash,
                  )}
                />
              </div>

              {issueTransactionHash && (
                <p className="mt-4 break-all font-mono text-[12px] text-slate-500">
                  Tx Hash: {issueTransactionHash}
                </p>
              )}
            </div>

            <button
              className="w-full rounded-full bg-slate-950 px-6 py-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={
                !contractAddress ||
                !address ||
                isWrongNetwork ||
                issueLoading
              }
            >
              {issueLoading
                ? "Issuing Certificate On Chain..."
                : "Issue Certificate"}
            </button>
          </form>
        </article>

        <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8">
          <SectionHeader
            eyebrow="Main Function"
            title="Verify Certificate"
            description="Recreate the hash from the supplied metadata text and compare it against the on-chain record."
          />

          <form className="mt-6 space-y-5" onSubmit={handleVerifySubmit}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Certificate ID
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                value={verifyForm.certificateId}
                onChange={(event) =>
                  handleVerifyFieldChange("certificateId", event.target.value)
                }
                placeholder="CERT-2026-001"
              />
              <FieldErrorText message={verifyErrors.certificateId} />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Metadata Text
              </span>
              <textarea
                className="mt-2 min-h-[182px] w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                value={verifyForm.metadataText}
                onChange={(event) =>
                  handleVerifyFieldChange("metadataText", event.target.value)
                }
                placeholder="Paste the original metadata text to reproduce the same hash."
              />
              <FieldErrorText message={verifyErrors.metadataText} />
            </label>

            <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Metadata Hash
                </p>
                {verifyMetadataHash && <CopyButton value={verifyMetadataHash} />}
              </div>
              <p className="mt-3 break-all font-mono text-[13px] text-slate-700">
                {verifyMetadataHash ||
                  "The same local hashing rule will be applied here before verification."}
              </p>
              <p className="mt-3 text-xs leading-6 text-slate-500">
                Try tampered metadata after a valid check: change one word or a
                date and verify again to show why the hash no longer matches.
              </p>
            </div>

            {latestIssued && (
              <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Shortcut for live demos
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Load the latest locally stored issuance data into this
                      verify form.
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    type="button"
                    onClick={handleLoadLatestIntoVerify}
                  >
                    Use Latest Issued Data
                  </button>
                </div>
              </div>
            )}

            {verifyError && (
              <p className="text-sm text-rose-600">{verifyError}</p>
            )}

            <button
              className="w-full rounded-full bg-emerald-600 px-6 py-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={!contractAddress || verifyLoading}
            >
              {verifyLoading ? "Verifying Certificate..." : "Verify Certificate"}
            </button>

            <p className="text-xs leading-6 text-slate-500">
              Verification uses the configured demo RPC, so it can run even if
              MetaMask is disconnected.
            </p>
          </form>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Result Panels
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Latest Issued Certificate and Verification Result
            </h3>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8">
            <SectionHeader
              eyebrow="Result"
              title="Latest Issued Certificate"
              description="This panel updates after a successful issuance so you can immediately point to the newest record during a lecture."
            />

            <div className="mt-6">
              {latestIssued ? (
                <div className="space-y-4">
                  <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/70 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">
                          Latest issuance captured
                        </p>
                        <p className="mt-1 text-xs text-emerald-800">
                          Stored locally for demo convenience at{" "}
                          {formatPanelTimestamp(latestIssued.storedAt)}.
                        </p>
                      </div>
                      <CopyButton value={latestIssued.transactionHash} label="Copy Tx Hash" />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailRow
                      label="Certificate ID"
                      value={latestIssued.certificate.certificateId}
                    />
                    <DetailRow
                      label="Recipient Name"
                      value={latestIssued.certificate.recipientName}
                    />
                    <DetailRow
                      label="Course Name"
                      value={latestIssued.certificate.courseName}
                    />
                    <DetailRow
                      label="Issuer Name"
                      value={latestIssued.certificate.issuerName}
                    />
                    <DetailRow
                      label="Issue Time"
                      value={formatIssueTime(latestIssued.certificate.issueTime)}
                    />
                    <DetailRow label="Chain" value={latestIssued.chainName} />
                    <DetailRow
                      label="Metadata Hash"
                      value={latestIssued.certificate.metadataHash}
                      mono
                      copyValue={latestIssued.certificate.metadataHash}
                    />
                    <DetailRow
                      label="Transaction Hash"
                      value={latestIssued.transactionHash}
                      mono
                    />
                  </div>

                  <p className="text-xs leading-6 text-slate-500">
                    Current limitation: this panel is restored from local browser
                    storage after refresh for demo continuity. It is not yet
                    re-querying the most recent issuance directly from chain.
                  </p>
                </div>
              ) : (
                <ResultPlaceholder
                  title="No certificate has been issued in this browser session yet."
                  description="Issue a sample certificate above. Once the transaction is confirmed, its details will appear here as the latest record."
                />
              )}
            </div>
          </article>

          <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8">
            <SectionHeader
              eyebrow="Result"
              title="Verification Result"
              description="Use this panel to explain what a valid match means and what a tampered mismatch looks like."
            />

            <div className="mt-6">
              {verificationPanel ? (
                <div className="space-y-4">
                  <div
                    className={`rounded-[28px] border p-5 ${
                      verificationPanel.isValid
                        ? "border-emerald-200 bg-emerald-50/75"
                        : "border-rose-200 bg-rose-50/85"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.3em] ${
                        verificationPanel.isValid
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      Verification Result
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                      <p
                        className={`text-4xl font-semibold tracking-tight ${
                          verificationPanel.isValid
                            ? "text-emerald-900"
                            : "text-rose-900"
                        }`}
                      >
                        {verificationPanel.isValid ? "VALID" : "INVALID"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Checked at {formatPanelTimestamp(verificationPanel.checkedAt)}
                      </p>
                    </div>
                    <p
                      className={`mt-4 text-sm leading-6 ${
                        verificationPanel.isValid
                          ? "text-emerald-900"
                          : "text-rose-900"
                      }`}
                    >
                      {verificationPanel.isValid
                        ? "The on-chain hash matches the provided metadata. The certificate record appears authentic and untampered."
                        : "The certificate could not be verified. The certificate ID may not exist, or the provided metadata text does not match the on-chain proof."}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailRow
                      label="Certificate ID"
                      value={verificationPanel.certificateId}
                    />
                    <DetailRow
                      label="Submitted Metadata Hash"
                      value={verificationPanel.metadataHash}
                      mono
                      copyValue={verificationPanel.metadataHash}
                    />
                  </div>

                  {verificationPanel.isValid && verificationPanel.certificate ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailRow
                        label="Recipient Name"
                        value={verificationPanel.certificate.recipientName}
                      />
                      <DetailRow
                        label="Course Name"
                        value={verificationPanel.certificate.courseName}
                      />
                      <DetailRow
                        label="Issuer Name"
                        value={verificationPanel.certificate.issuerName}
                      />
                      <DetailRow
                        label="Issue Time"
                        value={formatIssueTime(
                          verificationPanel.certificate.issueTime,
                        )}
                      />
                      <DetailRow
                        label="Issuer Wallet"
                        value={verificationPanel.certificate.issuerWallet}
                        mono
                        copyValue={verificationPanel.certificate.issuerWallet}
                      />
                      <DetailRow
                        label="Metadata Hash"
                        value={verificationPanel.certificate.metadataHash}
                        mono
                        copyValue={verificationPanel.certificate.metadataHash}
                      />
                    </div>
                  ) : (
                    <div className="rounded-[28px] border border-rose-100 bg-white p-5 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">
                        Why it may be invalid
                      </p>
                      <p className="mt-2 leading-6">
                        Most classroom demos fail here for one of two reasons:
                        the certificate ID does not exist on chain, or the
                        metadata text has been changed after issuance. Even a
                        small edit produces a different hash and breaks the
                        match.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <ResultPlaceholder
                  title="No verification has been run yet."
                  description="After you submit the verify form, the result panel will show either a green VALID match or a red INVALID mismatch with supporting context."
                />
              )}
            </div>
          </article>
        </div>
      </section>

      <footer className="rounded-[28px] border border-white/70 bg-white/70 px-6 py-5 text-center text-sm text-slate-500 backdrop-blur-xl">
        CertiChain course demo. Local Hardhat network, MetaMask for writes,
        Next.js frontend, and on-chain metadata hashes for authenticity checks.
      </footer>
    </div>
  );
};

export { CertiChainDemo };
