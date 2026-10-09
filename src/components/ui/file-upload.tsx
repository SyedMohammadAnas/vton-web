"use client";

import { cn } from "@/lib/utils";
import { IconUpload } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

const mainVariant = {
  initial: { x: 0, y: 0 },
  animate: { x: 20, y: -20, opacity: 0.9 },
};

const secondaryVariant = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function FileUpload({
  label,
  hint,
  file,
  onFile,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLImageElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const node = previewRef.current;
    if (!node || !file) return;
    const url = URL.createObjectURL(file);
    node.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = (next: File | undefined) => {
    if (!next) return;
    if (!ALLOWED.has(next.type)) {
      setError("Use a JPEG, PNG, or WebP photo.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("That photo is over 12 MB.");
      return;
    }
    setError("");
    onFile(next);
  };

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    maxSize: MAX_BYTES,
    onDrop: (accepted) => acceptFile(accepted[0]),
    onDropRejected: () => setError("Use one JPEG, PNG, or WebP under 12 MB."),
  });

  return (
    <div className="h-full min-w-0 w-full max-w-full overflow-hidden" {...getRootProps()}>
      <motion.div
        onClick={() => fileInputRef.current?.click()}
        whileHover="animate"
        className="group/file relative block h-full w-full cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-md"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => acceptFile(event.target.files?.[0])}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
          <GridPattern />
        </div>
        <div className="relative z-20 flex h-full flex-col">
          <p className="font-sans text-base font-semibold text-white">{label}</p>
          <p className="mt-1 text-sm text-neutral-400">{hint}</p>
          <div className="relative mt-4 min-h-0 flex-1">
            {file ? (
              // Local object URLs cannot go through next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={previewRef} alt={label} className="h-full w-full rounded-2xl object-cover" />
            ) : (
              <>
                <motion.div
                  layoutId={`file-upload-${label}`}
                  variants={mainVariant}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={cn(
                    "relative z-40 mx-auto mt-8 flex h-32 w-full max-w-32 items-center justify-center rounded-md bg-white shadow-[0px_10px_50px_rgba(0,0,0,0.1)]",
                  )}
                >
                  {isDragActive ? (
                    <p className="flex flex-col items-center text-sm text-neutral-600">
                      Drop it
                      <IconUpload className="h-4 w-4" />
                    </p>
                  ) : (
                    <IconUpload className="h-4 w-4 text-neutral-600" />
                  )}
                </motion.div>
                <motion.div
                  variants={secondaryVariant}
                  className="absolute inset-x-0 top-8 z-30 mx-auto h-32 w-full max-w-32 rounded-md border border-dashed border-sky-400 opacity-0 group-hover/file:opacity-100"
                />
              </>
            )}
          </div>
          {error ? <p className="relative z-20 mt-3 text-sm text-rose-300">{error}</p> : null}
          {file ? (
            <p className="relative z-20 mt-3 truncate text-sm text-neutral-300">
              {file.name}
              <span className="ml-2 text-neutral-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
            </p>
          ) : (
            <p className="relative z-20 mt-3 text-sm text-neutral-500">Drag a photo here or click to choose</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function GridPattern() {
  const columns = 18;
  const rows = 8;
  return (
    <div className="absolute inset-0 flex flex-wrap content-start gap-px overflow-hidden bg-neutral-900">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          return (
            <div
              key={`${col}-${row}`}
              className={`h-8 w-8 shrink-0 rounded-[2px] ${
                index % 2 === 0
                  ? "bg-neutral-950"
                  : "bg-neutral-950 shadow-[0px_0px_1px_3px_rgba(0,0,0,1)_inset]"
              }`}
            />
          );
        }),
      )}
    </div>
  );
}
