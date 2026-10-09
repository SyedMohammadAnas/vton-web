"use client";

import { FileUpload } from "@/components/ui/file-upload";
import { clearPending, listHistory, readPending, saveHistory, savePending, type HistoryRecord } from "@/lib/history";
import { prepareUpload } from "@/lib/prepare-image";
import { Download, Expand, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ACTIVE_KEY = "vton-active-job";

type JobStatus = "queued" | "processing" | "done" | "failed" | "cancelled";

type JobBody = {
  job_id: string;
  status: JobStatus;
  error: string | null;
  queue_position: number | null;
};

type Phase =
  | { kind: "idle" }
  | { kind: "queued"; position: number | null }
  | { kind: "processing" }
  | { kind: "done" }
  | { kind: "failed"; message: string };

function phaseLabel(phase: Phase): string {
  if (phase.kind === "queued") {
    return phase.position ? `Queued, position ${phase.position}` : "Queued";
  }
  if (phase.kind === "processing") return "Generating";
  if (phase.kind === "done") return "Done";
  if (phase.kind === "failed") return phase.message;
  return "";
}

export function Studio() {
  const [person, setPerson] = useState<File | null>(null);
  const [garment, setGarment] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [resultUrl, setResultUrl] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [runId, setRunId] = useState(0);
  const submitLock = useRef(false);
  const resultReadyRef = useRef(false);
  const failedRef = useRef(false);
  const progressRun = useRef(0);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  useEffect(() => {
    const jobId = sessionStorage.getItem(ACTIVE_KEY);
    if (!jobId) return;
    let cancelled = false;
    void resume(jobId, () => cancelled);
    return () => {
      cancelled = true;
    };
    // Resume once when the page loads. A later Generate call owns its own poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    void listHistory().then(setHistory).catch(() => setHistory([]));
  }, [historyOpen]);

  // Coast to 98 across 40s. Hold at 99 if the job is late. Rush the rest when the image is ready.
  useEffect(() => {
    const run = progressRun.current;
    if (run === 0) return;
    let value = 0;
    const started = performance.now();
    const id = window.setInterval(() => {
      if (failedRef.current || progressRun.current !== run) {
        window.clearInterval(id);
        return;
      }
      if (resultReadyRef.current) {
        value = Math.min(100, value + Math.max(4, (100 - value) * 0.45));
      } else {
        const elapsed = performance.now() - started;
        if (elapsed >= 40000) {
          value = 99;
        } else {
          const ticksLeft = Math.max(1, (40000 - elapsed) / 200);
          const step = ((98 - value) / ticksLeft) * (0.55 + Math.random() * 0.9);
          value = Math.min(98, value + step);
        }
      }
      const shown = Math.min(100, Math.round(value));
      setProgress(shown);
      if (value >= 100 && resultReadyRef.current) {
        setRevealed(true);
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [runId]);

  async function resume(jobId: string, isCancelled: () => boolean) {
    setBusy(true);
    setRevealed(false);
    setProgress(0);
    resultReadyRef.current = false;
    failedRef.current = false;
    progressRun.current += 1;
    setRunId(progressRun.current);
    setPhase({ kind: "processing" });
    try {
      await poll(jobId, isCancelled);
    } finally {
      if (!isCancelled()) setBusy(false);
    }
  }

  async function poll(jobId: string, isCancelled: () => boolean) {
    const started = Date.now();
    let failures = 0;
    while (!isCancelled()) {
      if (Date.now() - started > 11 * 60 * 1000) {
        failedRef.current = true;
        setPhase({ kind: "failed", message: "The job took too long." });
        sessionStorage.removeItem(ACTIVE_KEY);
        await clearPending();
        return;
      }
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const body = (await response.json()) as JobBody & { error?: string };
        if (!response.ok) {
          throw new Error(body.error || "Status check failed.");
        }
        failures = 0;
        if (body.status === "queued") {
          setPhase({ kind: "queued", position: body.queue_position });
        } else if (body.status === "processing") {
          setPhase({ kind: "processing" });
        } else if (body.status === "done") {
          await finish(jobId);
          return;
        } else if (body.status === "cancelled") {
          failedRef.current = true;
          setPhase({ kind: "failed", message: "Cancelled." });
          sessionStorage.removeItem(ACTIVE_KEY);
          await clearPending();
          return;
        } else {
          failedRef.current = true;
          setPhase({ kind: "failed", message: body.error || "Generation failed." });
          sessionStorage.removeItem(ACTIVE_KEY);
          await clearPending();
          return;
        }
      } catch (error) {
        failures += 1;
        if (failures > 8) {
          failedRef.current = true;
          setPhase({
            kind: "failed",
            message: error instanceof Error ? error.message : "Cannot reach the backend.",
          });
          return;
        }
      }
      await wait(Math.min(8000, 2000 * 2 ** Math.min(failures, 2)));
    }
  }

  async function finish(jobId: string) {
    const response = await fetch(`/api/jobs/${jobId}/result`, { cache: "no-store" });
    if (!response.ok) {
      failedRef.current = true;
      setPhase({ kind: "failed", message: "The result image is missing." });
      return;
    }
    const result = await response.blob();
    const pending = await readPending();
    if (pending && pending.jobId === jobId) {
      await saveHistory({
        id: jobId,
        createdAt: pending.createdAt,
        person: pending.person,
        garment: pending.garment,
        result,
      });
      await clearPending();
    }
    sessionStorage.removeItem(ACTIVE_KEY);
    const url = URL.createObjectURL(result);
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    // Let the percent finish before the image is shown.
    resultReadyRef.current = true;
    setPhase({ kind: "done" });
  }

  async function generate() {
    if (!person || !garment || busy || submitLock.current) return;
    if (sessionStorage.getItem(ACTIVE_KEY)) return;
    submitLock.current = true;
    setBusy(true);
    setConfirmNew(false);
    setRevealed(false);
    setProgress(0);
    resultReadyRef.current = false;
    failedRef.current = false;
    progressRun.current += 1;
    setRunId(progressRun.current);
    setPhase({ kind: "processing" });
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    let cancelled = false;
    try {
      const preparedPerson = await prepareUpload(person);
      const preparedGarment = await prepareUpload(garment);
      const form = new FormData();
      form.append("person_image", preparedPerson);
      form.append("garment_image", preparedGarment);
      const response = await fetch("/api/tryon", { method: "POST", body: form });
      const body = (await response.json()) as { job_id?: string; error?: string; status?: string };
      if (!response.ok || !body.job_id) {
        throw new Error(body.error || "Could not start the try-on.");
      }
      sessionStorage.setItem(ACTIVE_KEY, body.job_id);
      await savePending({
        jobId: body.job_id,
        createdAt: Date.now(),
        person: preparedPerson,
        garment: preparedGarment,
      });
      if (body.status === "done") {
        await finish(body.job_id);
        return;
      }
      await poll(body.job_id, () => cancelled);
    } catch (error) {
      failedRef.current = true;
      setPhase({
        kind: "failed",
        message: error instanceof Error ? error.message : "Could not start the try-on.",
      });
    } finally {
      cancelled = true;
      submitLock.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    const jobId = sessionStorage.getItem(ACTIVE_KEY);
    if (!jobId) return;
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
  }

  function download() {
    if (!resultUrl) return;
    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = "vton-result.png";
    link.click();
  }

  function fullscreen(target: HTMLElement | null) {
    if (!target) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void target.requestFullscreen();
  }

  function resetStudio() {
    setPerson(null);
    setGarment(null);
    setResultUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setPhase({ kind: "idle" });
    setProgress(0);
    setRevealed(false);
    setConfirmNew(false);
    resultReadyRef.current = false;
  }

  const working = phase.kind === "queued" || phase.kind === "processing";

  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      <div className="flex h-full w-full min-w-0 flex-col gap-4 overflow-x-hidden bg-black px-3 py-3 lg:overflow-hidden">
        <header className="flex w-full items-center justify-between gap-3 rounded-full border-2 border-neutral-500 bg-black px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[0.18em]">VTON</p>
            <p className="hidden truncate text-[11px] text-neutral-400 sm:block">
              Personal use. CatVTON is non-commercial.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full border-2 border-neutral-500 px-4 py-1.5 text-sm"
            onMouseEnter={() => setHistoryOpen(true)}
            onClick={() => setHistoryOpen(true)}
          >
            History
          </button>
        </header>
        <p className="text-center text-[11px] text-neutral-500 sm:hidden">
          Personal use. CatVTON is non-commercial.
        </p>

        <main className="scrollbar-none grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 gap-4 overflow-y-auto max-lg:auto-rows-[minmax(calc(100dvh-10rem),auto)] lg:grid-cols-3 lg:gap-8 lg:overflow-hidden">
          <FileUpload
            label="Person"
            hint="Full photo of the person"
            file={person}
            onFile={setPerson}
          />
          <FileUpload
            label="Garment"
            hint="Upper-body garment only"
            file={garment}
            onFile={setGarment}
          />
          <ResultPanel
            phase={phase}
            resultUrl={resultUrl}
            progress={progress}
            revealed={revealed}
            confirmNew={confirmNew}
            canGenerate={Boolean(person && garment) && !busy}
            working={working}
            onGenerate={() => void generate()}
            onAskNew={() => setConfirmNew(true)}
            onKeep={() => setConfirmNew(false)}
            onReset={resetStudio}
            onCancel={() => void cancel()}
            onDownload={download}
            onFullscreen={fullscreen}
          />
        </main>
      </div>

      {historyOpen ? (
        <HistoryDrawer
          records={history}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ResultPanel({
  phase,
  resultUrl,
  progress,
  revealed,
  confirmNew,
  canGenerate,
  working,
  onGenerate,
  onAskNew,
  onKeep,
  onReset,
  onCancel,
  onDownload,
  onFullscreen,
}: {
  phase: Phase;
  resultUrl: string;
  progress: number;
  revealed: boolean;
  confirmNew: boolean;
  canGenerate: boolean;
  working: boolean;
  onGenerate: () => void;
  onAskNew: () => void;
  onKeep: () => void;
  onReset: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onFullscreen: (target: HTMLElement | null) => void;
}) {
  const showProgress = !revealed && phase.kind !== "idle" && phase.kind !== "failed";
  const showImage = revealed && phase.kind === "done" && Boolean(resultUrl);

  return (
    <section className="relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl border-2 border-neutral-500 bg-black lg:min-h-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-base font-semibold">Result</p>
        {phase.kind !== "idle" && !showProgress ? (
          <p className="text-sm text-neutral-300">{phaseLabel(phase)}</p>
        ) : null}
      </div>
      <div className="relative m-5 min-h-0 flex-1 overflow-hidden rounded-2xl border-2 border-neutral-600 bg-black">
        {showImage ? (
          <div className="group relative h-full">
            {/* Local object URLs cannot go through next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultUrl} alt="Try-on result" className="h-full w-full object-contain" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                type="button"
                aria-label="Download"
                className="rounded-full border-2 border-neutral-500 bg-black p-2 text-white"
                onClick={onDownload}
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Fullscreen"
                className="rounded-full border-2 border-neutral-500 bg-black p-2 text-white"
                onClick={(event) => onFullscreen(event.currentTarget.parentElement?.parentElement ?? null)}
              >
                <Expand className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
        {showProgress ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-4xl font-semibold tabular-nums">{progress}%</p>
          </div>
        ) : null}
        {!showProgress && !showImage ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-400">
            {phase.kind === "failed" ? phase.message : "The try-on appears here."}
          </div>
        ) : null}
      </div>
      <div className="flex gap-2 px-5 pb-5">
        {showImage && confirmNew ? (
          <>
            <button
              type="button"
              onClick={onReset}
              className="flex flex-1 items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={onKeep}
              className="flex flex-1 items-center justify-center rounded-full border-2 border-neutral-500 px-4 py-2.5 text-sm"
            >
              No
            </button>
          </>
        ) : showImage ? (
          <button
            type="button"
            onClick={onAskNew}
            className="flex flex-1 items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black"
          >
            Generate new
          </button>
        ) : (
          <button
            type="button"
            disabled={!canGenerate}
            onClick={onGenerate}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            {working || showProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate
          </button>
        )}
        {working ? (
          <button type="button" onClick={onCancel} className="rounded-full border-2 border-neutral-500 px-4 py-2.5 text-sm">
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}

function HistoryDrawer({ records, onClose }: { records: HistoryRecord[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <button type="button" aria-label="Close history" className="h-full flex-1" onClick={onClose} />
      <aside
        onMouseLeave={onClose}
        className="scrollbar-none h-full w-full max-w-md animate-[slide-in_220ms_ease-out] overflow-y-auto border-l-2 border-neutral-500 bg-black p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-semibold">History</p>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-neutral-400">No try-ons saved in this browser yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {records.map((record) => (
              <li key={record.id} className="grid grid-cols-3 gap-2">
                <HistoryImage blob={record.person} alt="Person" />
                <HistoryImage blob={record.garment} alt="Garment" />
                <HistoryImage blob={record.result} alt="Result" />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function HistoryImage({ blob, alt }: { blob: Blob; alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const url = URL.createObjectURL(blob);
    node.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  // Local object URLs cannot go through next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt={alt} className="aspect-[3/4] w-full rounded-xl object-cover bg-neutral-900" />;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
