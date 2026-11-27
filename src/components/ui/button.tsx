import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium", {
  variants: { variant: { outline: "border border-line bg-panel px-3 py-2", icon: "size-9 border border-line bg-panel" } },
  defaultVariants: { variant: "outline" },
});

export function Button({ className, variant, type = "button", ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, className }))} {...props} />;
}
