import { useCallback, useEffect, useRef, useState } from "react";
import { ToastContext } from "./toast-context.js";
import "../css/Toast.css";

const DURATION_MS = 3000; // how long a toast stays up
const EXIT_MS = 180; // fade out time
const SWIPE_DISMISS_PX = 60; // drag further than this to dismiss
const TAP_SLOP_PX = 6; // moved less than this = a tap

let nextId = 0;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // mirror of state so callbacks always see the latest list
  const toastsRef = useRef([]);
  const timersRef = useRef(new Map());

  function commit(next) {
    toastsRef.current = next;
    setToasts(next);
  }

  function clearTimer(id) {
    clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
  }

  const remove = useCallback((id) => {
    clearTimer(id);
    commit(toastsRef.current.filter((t) => t.id !== id));
  }, []);

  // fade out, then remove
  const dismiss = useCallback(
    (id) => {
      const toast = toastsRef.current.find((t) => t.id === id);
      if (!toast || toast.leaving) return;
      clearTimer(id);
      commit(
        toastsRef.current.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      );
      timersRef.current.set(
        id,
        setTimeout(() => remove(id), EXIT_MS),
      );
    },
    [remove],
  );

  const showToast = useCallback(
    (message, type = "warning") => {
      // an identical toast is replaced right away, different ones stack
      toastsRef.current
        .filter((t) => t.message === message && t.type === type)
        .forEach((t) => clearTimer(t.id));
      const id = ++nextId;
      commit([
        ...toastsRef.current.filter(
          (t) => !(t.message === message && t.type === type),
        ),
        { id, message, type, leaving: false },
      ]);
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  // clear any pending timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const startXRef = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  function handlePointerDown(e) {
    startXRef.current = e.clientX;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves if the finger leaves the toast
    } catch {
      // pointer already gone, nothing to capture
    }
    setIsDragging(true);
  }

  function handlePointerMove(e) {
    if (startXRef.current === null) return;
    setDragX(e.clientX - startXRef.current);
  }

  function handlePointerUp(e) {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    startXRef.current = null;
    setIsDragging(false);

    if (Math.abs(dx) > SWIPE_DISMISS_PX) {
      // keep sliding off in the swipe direction
      setDragX(Math.sign(dx) * 360);
      onDismiss(toast.id);
    } else if (Math.abs(dx) < TAP_SLOP_PX) {
      onDismiss(toast.id);
    } else {
      setDragX(0); // not far enough, snap back
    }
  }

  function handlePointerCancel() {
    startXRef.current = null;
    setIsDragging(false);
    setDragX(0);
  }

  return (
    <div
      className={`toast toast-${toast.type} ${toast.leaving ? "is-leaving" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{
        transform: `translateX(${dragX}px)`,
        opacity: toast.leaving ? 0 : Math.max(0, 1 - Math.abs(dragX) / 220),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <span className="toast-dot" />
      {toast.message}
    </div>
  );
}
