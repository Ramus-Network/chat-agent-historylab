import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "document-border inline-flex items-center justify-center whitespace-nowrap font-mono text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
          {
            "bg-black/40 text-primary-foreground shadow-sm hover:bg-accent/10": variant === "default",
            "bg-destructive/20 text-destructive-foreground hover:bg-destructive/30 border border-destructive/50": variant === "destructive",
            "border border-white/10 bg-transparent hover:bg-accent/5 hover:text-accent": variant === "outline",
            "bg-secondary/30 text-secondary-foreground hover:bg-secondary/40": variant === "secondary",
            "bg-transparent text-accent underline-offset-4 hover:underline": variant === "link",
            "bg-transparent hover:bg-accent/5 hover:text-accent": variant === "ghost",
            "h-10 px-4 py-2": size === "default",
            "h-8 px-3 text-xs": size === "sm",
            "h-12 px-6 text-base": size === "lg",
            "h-9 w-9 p-0": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
