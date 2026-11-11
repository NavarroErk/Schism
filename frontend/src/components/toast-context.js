import { createContext, useContext } from "react";

export const ToastContext = createContext(() => {});

// const showToast = useToast();
// showToast("Select an output format");            -> orange warning
// showToast("Server could not be reached.", "error") -> red
export function useToast() {
  return useContext(ToastContext);
}
