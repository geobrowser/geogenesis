/// <reference types="vite/client" />
import {createRootRoute, HeadContent, Scripts} from "@tanstack/react-router"
import {TanStackRouterDevtools} from "@tanstack/react-router-devtools"
import * as React from "react"
import {DefaultCatchBoundary} from "@/components/default-catch-boundary"
import {Navbar} from "@/components/navbar"
import {NotFound} from "@/components/not-found"
import {Providers} from "@/providers"
import {seo} from "@/std/seo"
import appCss from "@/styles/app.css?url"
import fontCss from "@/styles/satoshi.css?url"

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			...seo({
				title: "Geo Podcasts",
				description: `Discover and curate podcasts on Geo.`,
			}),
		],
		links: [
			{rel: "stylesheet", href: appCss},
			{rel: "stylesheet", href: fontCss},
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/logo.svg",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "16x16",
				href: "/logo.svg",
			},
			{rel: "manifest", href: "/site.webmanifest", color: "#fffff"},
			{rel: "icon", href: "/logo.svg"},
		],
		scripts: [
			{
				src: "/customScript.js",
				type: "text/javascript",
			},
		],
	}),
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
})

function RootDocument({children}: {children: React.ReactNode}) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<Providers>
					<div className="w-full">
						<Navbar />
					</div>
					<div>{children}</div>
				</Providers>
				<TanStackRouterDevtools position="bottom-right" />
				<Scripts />
			</body>
		</html>
	)
}
