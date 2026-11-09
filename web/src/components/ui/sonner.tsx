"use client"

import { useTheme } from "@/components/layout/ThemeProvider"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !rounded-md !border-l-[3px] !shadow-[0_16px_40px_-18px_rgb(0_0_0/0.35)] !font-sans",
          title: "!font-medium",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-[5px] !font-medium",
          cancelButton: "!bg-muted !text-foreground !rounded-[5px]",
          success: "!border-l-paid",
          error: "!border-l-destructive",
          warning: "!border-l-warn",
          info: "!border-l-saffron",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
