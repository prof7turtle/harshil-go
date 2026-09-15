import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-neutral-900 text-neutral-50 shadow hover:bg-neutral-800",
        secondary:
          "border-transparent bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
        muted:
          "border-neutral-200 bg-neutral-50 text-neutral-600 font-medium",
        outline: "text-neutral-950 border-neutral-200",
        // Risk levels
        lowRisk:
          "border-emerald-200 bg-emerald-50 text-emerald-700 font-medium",
        mediumRisk:
          "border-amber-200 bg-amber-50 text-amber-800 font-medium",
        highRisk:
          "border-red-200 bg-red-50 text-red-700 font-medium",
        // Relevance levels
        highRelevance:
          "border-emerald-200 bg-emerald-50 text-emerald-700 font-medium",
        mediumRelevance:
          "border-amber-200 bg-amber-50 text-amber-800 font-medium",
        lowRelevance:
          "border-red-200 bg-red-50 text-red-700 font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
