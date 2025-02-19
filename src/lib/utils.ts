import { clsx, type ClassValue } from "clsx"
import { Metadata } from "next"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function absoluteUrl(path: string) {
  if (typeof window !== "undefined") return path
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}${path}`
  return `http://localhost:${process.env.PORT ?? 3000}${path}`
}

export function constructMetadata({
  title = "Bookworm - Talk to your PDF today!",
  description = "Bookworm is an open-source software which allows you to chat with your PDFs.",
  image = "/thumbnail.png",
  icons = "/favicon.ico",
  noIndex = false
}: {
  title?: string
  description?: string
  image?: string
  icons?: string
  noIndex?: boolean
} = {}): Metadata {
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: image
        }
      ],
      type: 'website', // Specify the type of content
      url: absoluteUrl(''), // Set the canonical URL for the page
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      creator: "@qwertyfusion"
    },
    icons,
    metadataBase: new URL('https://https://bookworm-qwertyfusion.vercel.app'),
    themeColor: '#FFF',
    ...(noIndex && {
      robots: {
        index: false,
        follow: false
      }
    })
  }
}