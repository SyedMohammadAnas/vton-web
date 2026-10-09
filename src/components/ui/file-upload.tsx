"use client";

import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

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
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border-2 border-[#e8470b] bg-white p-5"
      {...getRootProps()}
    >
      <p className="text-base font-semibold">{label}</p>
      <p className="mt-1 text-sm text-neutral-600">{hint}</p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={`mt-4 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed ${
          isDragActive ? "border-[#e8470b]" : "border-[#e8470b]/50"
        } bg-neutral-50`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => acceptFile(event.target.files?.[0])}
        />
        {file ? (
          // Local object URLs cannot go through next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={previewRef} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="px-6 text-center text-sm text-neutral-600">
            {isDragActive ? "Drop the photo" : "Click or drop a photo"}
          </span>
        )}
      </button>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {file ? (
        <p className="mt-3 truncate text-sm text-neutral-700">
          {file.name}
          <span className="ml-2 text-neutral-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
        </p>
      ) : null}
    </section>
  );
}
