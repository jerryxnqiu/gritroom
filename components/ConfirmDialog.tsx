"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      return;
    }
    if (node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="shelf-dialog confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h3 id={titleId}>{title}</h3>
      <p className="meta">{message}</p>
      <div className="shelf-actions">
        <button type="button" className="button secondary" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="button" disabled={pending} onClick={onConfirm}>
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
