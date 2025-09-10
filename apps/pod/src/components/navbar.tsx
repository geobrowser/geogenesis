import {useHypergraphApp, useHypergraphAuth} from "@graphprotocol/hypergraph-react"
import {Link, useNavigate, useSearch} from "@tanstack/react-router"
import * as React from "react"
import {Button} from "@/components/ui/button"
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu"
import {Input} from "@/components/ui/input"
import {useDebounceEffect} from "@/hooks/use-debounce-effect"
import {DefaultAvatar} from "./icons/default-avatar"
import {Discover} from "./icons/discover"
import {Logo} from "./icons/logo"
import {Save} from "./icons/save"
import {Search} from "./icons/search"

export function Navbar() {
	const navigate = useNavigate()

	const {identity} = useHypergraphAuth()
	const {redirectToConnect, logout} = useHypergraphApp()

	const handleSignIn = () => {
		redirectToConnect({
			storage: localStorage,
			connectUrl: "https://connect.geobrowser.io/",
			successUrl: `${window.location.origin}/authenticate-success`,
			redirectFn: (url: URL) => {
				window.location.href = url.toString()
			},
		})
	}

	const inputRef = React.useRef<HTMLInputElement>(null)

	const search = useSearch({
		from: "/search",
		shouldThrow: false,
	})

	const currentQuery = search?.q ?? ""

	// Debounce the search and navigation
	const {value, setValue} = useDebounceEffect<string>({
		callback: (text) => {
			if (text) {
				navigate({to: "/search", search: {q: text}})
			} else if (location.pathname === "/search") {
				// Stay on search page with empty query
				navigate({to: "/search", search: {q: ""}})
			}
		},
		delay: 300,
		initialValue: currentQuery,
	})

	React.useEffect(() => {
		// Maintain focus on search input after navigation
		if (value && inputRef.current) {
			inputRef.current.focus()
		}
	}, [value])

	// Update local value when route changes
	React.useEffect(() => {
		setValue(currentQuery)
	}, [currentQuery, setValue])

	return (
		<nav className="w-full bg-black text-white border-b border-secondary-darkest">
			<div className="max-w-[1568px] mx-auto px-5 flex items-center justify-between py-3">
				<div className="flex items-center gap-10">
					<Logo />

					<div className="flex items-center gap-5">
						<Link
							to="/"
							className="flex items-center gap-2 text-button"
							activeProps={{
								className: "text-primary-text [&>svg]:text-primary-cta",
							}}
							inactiveProps={{
								className: "text-secondary-light [&>svg]:text-secondary-light",
							}}
						>
							<Discover />
							Discover
						</Link>
						<Link
							to="/saved"
							className="flex items-center gap-2 text-button transition-colors duration-200"
							activeProps={{
								className: "text-primary-text [&>svg]:text-primary-cta [&>svg]:fill-primary-cta",
							}}
							inactiveProps={{
								className: "text-secondary-light [&>svg]:text-secondary-text",
							}}
						>
							<Save />
							Saved
						</Link>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-primary-text" />
						<Input
							ref={inputRef}
							value={value ?? ""}
							onChange={(e) => {
								const newValue = e.currentTarget.value
								setValue(newValue)
							}}
							placeholder="Search podcasts..."
							className="pl-10.5 w-[376px] text-button bg-secondary-dark"
						/>
					</div>

					{identity ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button className="outline-none">
									<div className="flex items-center justify-center rounded-full bg-secondary-dark w-10 h-10">
										<DefaultAvatar />
									</div>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-[148px] rounded-full border-secondary-medium bg-secondary-dark"
							>
								<DropdownMenuItem
									className="text-primary-text hover:bg-secondary-medium text-button p-4 rounded-full cursor-pointer"
									onClick={logout}
								>
									Sign out
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<Button onClick={handleSignIn}>Sign up</Button>
					)}
				</div>
			</div>
		</nav>
	)
}
