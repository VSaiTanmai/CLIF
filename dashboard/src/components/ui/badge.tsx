import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "text-foreground",
        critical: "border-transparent bg-red-600 text-white",
        high: "border-transparent bg-orange-500 text-white",
        medium: "border-transparent bg-amber-500 text-white",
        low: "border-transparent bg-emerald-500 text-white",
        info: "border-transparent bg-slate-400 text-white",
        in_progress: "border-transparent bg-amber-400 text-amber-900",
        open: "border-transparent bg-orange-500 text-white",
        closed: "border-transparent bg-gray-400 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
