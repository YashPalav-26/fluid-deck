import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn.ts";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white",
        "hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
