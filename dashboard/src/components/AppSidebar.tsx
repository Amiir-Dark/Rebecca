import {
	Box,
	chakra,
	Collapse,
	Flex,
	HStack,
	Image,
	Text,
	Tooltip,
	useColorModeValue,
	VStack,
} from "@chakra-ui/react";
import {
	ArrowsRightLeftIcon,
	BellAlertIcon,
	BoltIcon,
	BookOpenIcon,
	BriefcaseIcon,
	ChartBarIcon,
	ChevronDownIcon,
	CircleStackIcon,
	ClockIcon,
	CodeBracketSquareIcon,
	Cog6ToothIcon,
	Cog8ToothIcon,
	CommandLineIcon,
	DocumentDuplicateIcon,
	BellIcon,
	DocumentTextIcon,
	EyeIcon,
	HomeIcon,
	LinkIcon,
	ServerStackIcon,
	Squares2X2Icon,
	UserCircleIcon,
	UserGroupIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import logoUrl from "assets/logo.svg";
import useGetUser from "hooks/useGetUser";
import {
	type ElementType,
	type FC,
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useHref, useLocation, useNavigate } from "react-router-dom";
import { AdminRole, AdminSection, AdminSudoScope } from "types/Admin";
import {
	getTutorialManifestUrl,
	getTutorialSeenKey,
	normalizeTutorialLang,
} from "utils/tutorials";

const iconProps = {
	baseStyle: {
		w: 5,
		h: 5,
	},
};

const HomeIconStyled = chakra(HomeIcon, iconProps);
const UsersIconStyled = chakra(UserGroupIcon, iconProps);
const BulkActionsIconStyled = chakra(BoltIcon, iconProps);
const RecentActionsIconStyled = chakra(ClockIcon, iconProps);
const SettingsIconStyled = chakra(Cog6ToothIcon, iconProps);
const MasterSettingsIconStyled = chakra(Cog8ToothIcon, iconProps);
const NodeIconStyled = chakra(ServerStackIcon, iconProps);
const AdminIconStyled = chakra(BriefcaseIcon, iconProps);
const ServicesIconStyled = chakra(Squares2X2Icon, iconProps);
const HostsIconStyled = chakra(LinkIcon, iconProps);
const HAProxyIconStyled = chakra(ArrowsRightLeftIcon, iconProps);
const UsageIconStyled = chakra(ChartBarIcon, iconProps);
const MyAccountIconStyled = chakra(UserCircleIcon, iconProps);
const NotificationIconStyled = chakra(BellIcon, iconProps);
const InsightsIconStyled = chakra(EyeIcon, iconProps);
const TutorialIconStyled = chakra(BookOpenIcon, iconProps);
const XraySettingsIconStyled = chakra(WrenchScrewdriverIcon, iconProps);
const XrayLogsIconStyled = chakra(DocumentTextIcon, iconProps);
const ApiDocsIconStyled = chakra(CodeBracketSquareIcon, iconProps);
const PHPMyAdminIconStyled = chakra(CircleStackIcon, iconProps);
const ExternalAppsIconStyled = chakra(CommandLineIcon, iconProps);
const PlaceholderIconStyled = chakra(DocumentDuplicateIcon, iconProps);
const TutorialUpdateIconStyled = chakra(BellAlertIcon, {
	baseStyle: {
		w: 3,
		h: 3,
	},
});
interface AppSidebarProps {
	collapsed: boolean;
	/** when rendered inside a Drawer on mobile */
	inDrawer?: boolean;
	/** optional callback to request the parent to expand the sidebar */
	onRequestExpand?: () => void;
}

type SidebarItem = {
	title: string;
	icon: ElementType;
	url?: string;
	subItems?: {
		title: string;
		url: string;
		icon: ElementType;
	}[];
};
type SidebarSubItems = NonNullable<SidebarItem["subItems"]>;

export const AppSidebar: FC<AppSidebarProps> = ({
	collapsed,
	inDrawer = false,
	onRequestExpand,
}) => {
	const { t, i18n } = useTranslation();
	const location = useLocation();
	const navigate = useNavigate();
	const dashboardRoot = useHref("/");
	const { userData } = useGetUser();
	const currentLanguage = i18n.language || "en";
	const tutorialsUrl = "/tutorials";
	const sectionAccess = userData.permissions?.sections;
	const isFullAccess = userData.role === AdminRole.FullAccess;
	const isPrivilegedAdmin = isFullAccess || userData.role === AdminRole.Sudo;
	const sidebarBg = useColorModeValue("panel.sidebar", "panel.sidebar");
	const sidebarBorderColor = useColorModeValue("panel.border", "panel.border");
	const sidebarPanelBg = useColorModeValue("panel.elevated", "panel.elevated");
	const sidebarPanelBorder = useColorModeValue("panel.border", "panel.border");
	const sidebarShadow = useColorModeValue(
		"0 18px 48px rgba(15, 23, 42, 0.10)",
		"0 18px 48px rgba(0, 0, 0, 0.32)",
	);
	const itemColor = useColorModeValue(
		"panel.textSecondary",
		"panel.textSecondary",
	);
	const activeItemBg = useColorModeValue("panel.elevated", "panel.elevated");
	const activeItemColor = useColorModeValue("panel.text", "panel.text");
	const hoverItemBg = useColorModeValue("panel.elevated", "panel.elevated");
	const subNavBorder = useColorModeValue("panel.border", "panel.border");
	const defaultSelfPermissions = {
		self_myaccount: false,
		self_change_password: false,
		self_api_keys: false,
		self_placeholders: false,
	};
	const baseSelf =
		userData.permissions?.self_permissions ?? defaultSelfPermissions;
	const selfAccess = isFullAccess
		? { self_myaccount: true, self_change_password: true, self_api_keys: true }
		: baseSelf;
	const canViewUsage = Boolean(sectionAccess?.[AdminSection.Usage]);
	const canViewAdmins = Boolean(sectionAccess?.[AdminSection.Admins]);
	const canViewServicesSection = Boolean(
		sectionAccess?.[AdminSection.Services],
	);
	const canViewRecentActions =
		isFullAccess ||
		(userData.role === AdminRole.Sudo &&
			Boolean(userData.permissions?.sudo?.[AdminSudoScope.Xray]));
	const canManagePlaceholders =
		isFullAccess ||
		(userData.role === AdminRole.Sudo &&
			Boolean(userData.permissions?.sudo?.[AdminSudoScope.Subscriptions])) ||
		Boolean(baseSelf.self_placeholders);
	const [hasNewTutorials, setHasNewTutorials] = useState(false);

	const checkTutorialUpdates = useCallback(async () => {
		const langKey = normalizeTutorialLang(i18n.language);
		try {
			const response = await fetch(getTutorialManifestUrl(dashboardRoot), {
				headers: { "Cache-Control": "no-cache" },
			});
			if (!response.ok) {
				throw new Error(`Failed to load tutorial meta: ${response.status}`);
			}
			const manifest = (await response.json()) as Record<string, string>;
			const version = manifest[langKey]?.toString().trim();
			if (!version) {
				setHasNewTutorials(false);
				return;
			}
			const seenKey = getTutorialSeenKey(langKey);
			const seenVersion = window.localStorage.getItem(seenKey);
			if (seenVersion === null) {
				window.localStorage.setItem(seenKey, version);
				setHasNewTutorials(false);
				return;
			}
			setHasNewTutorials(seenVersion !== version);
		} catch (err) {
			console.error("Failed to check tutorial updates", err);
			setHasNewTutorials(false);
		}
	}, [dashboardRoot, i18n.language]);

	useEffect(() => {
		void checkTutorialUpdates();
	}, [checkTutorialUpdates]);

	const baseSettingsSubItems: SidebarSubItems = [
		isPrivilegedAdmin
			? {
					title: "errors",
					url: "/errors",
					icon: InsightsIconStyled,
				}
			: null,
		sectionAccess?.[AdminSection.Hosts]
			? {
					title: t("header.hostSettings"),
					url: "/hosts",
					icon: HostsIconStyled,
				}
			: null,
		sectionAccess?.[AdminSection.Nodes]
			? {
					title: t("header.nodeSettings"),
					url: "/node-settings",
					icon: NodeIconStyled,
				}
			: null,
		sectionAccess?.[AdminSection.Integrations]
			? {
					title: t("header.integrationSettings"),
					url: "/settings",
					icon: MasterSettingsIconStyled,
				}
			: null,
		sectionAccess?.[AdminSection.Xray]
			? {
					title: t("header.xraySettings"),
					url: "/xray-settings",
					icon: XraySettingsIconStyled,
				}
			: null,
		sectionAccess?.[AdminSection.Xray]
			? {
					title: t("pages.xray.logs"),
					url: "/xray-logs",
					icon: XrayLogsIconStyled,
				}
			: null,
		sectionAccess?.[AdminSection.Xray]
			? {
					title: t("header.accessInsights"),
					url: "/access-insights",
					icon: InsightsIconStyled,
				}
			: null,
		canViewRecentActions
			? {
					title: t("recentActions.title"),
					url: "/recent-actions",
					icon: RecentActionsIconStyled,
				}
			: null,
		isPrivilegedAdmin
			? {
					title: t("phpmyadmin.menu"),
					url: "/phpmyadmin",
					icon: PHPMyAdminIconStyled,
				}
			: null,
		canManagePlaceholders
			? {
					title: isPrivilegedAdmin
						? t("placeholders.menu")
						: t("placeholders.settingsMenu"),
					url: "/placeholders",
					icon: PlaceholderIconStyled,
				}
			: null,
	].filter(Boolean) as SidebarSubItems;

	const settingsSubItems: SidebarSubItems = [...baseSettingsSubItems];
	if (canViewServicesSection) {
		settingsSubItems.unshift({
			title: t("services.title"),
			url: "/services",
			icon: ServicesIconStyled,
		});
	}

	const defaultTabByPath: Record<string, string> = {
		"/settings": "panel",
		"/hosts": "inbounds",
		"/usage": "services",
		"/xray-settings": "basic",
	};

	const handleNavClick = (event?: ReactMouseEvent, targetUrl?: string) => {
		if (inDrawer && onRequestExpand) {
			onRequestExpand();
		}
		if (!targetUrl) return;
		const defaultTab = defaultTabByPath[targetUrl];
		if (defaultTab) {
			event?.preventDefault();
			const normalized = targetUrl.startsWith("/")
				? targetUrl
				: `/${targetUrl}`;
			navigate(`${normalized}#${defaultTab}`);
		}
	};

	const items: SidebarItem[] = [
		{ title: t("dashboard"), url: "/", icon: HomeIconStyled },
		{ title: t("users"), url: "/users", icon: UsersIconStyled },
	];

	if (selfAccess.self_myaccount) {
		items.splice(1, 0, {
			title: t("myaccount.menu"),
			url: "/myaccount",
			icon: MyAccountIconStyled,
		});
	}

	items.push({
		title: t("notifications.menu"),
		url: "/notifications",
		icon: NotificationIconStyled,
	});

	if (canViewUsage) {
		items.push({
			title: t("usage.menu"),
			url: "/usage",
			icon: UsageIconStyled,
		});
	}
	if (canViewAdmins) {
		items.push({
			title: t("admins"),
			url: "/admins",
			icon: AdminIconStyled,
		});
	}
	if (settingsSubItems.length > 0) {
		items.push({
			title: t("header.settings"),
			icon: SettingsIconStyled,
			subItems: settingsSubItems,
		});
	}

	const directItems = items.filter((item) => item.url);
	const directByUrl = new Map(
		directItems.map((item) => [item.url as string, item]),
	);
	const settingsByUrl = new Map(
		settingsSubItems.map((item) => [item.url, item as SidebarItem]),
	);
	const pickDirect = (url: string) => directByUrl.get(url);
	const pickSetting = (url: string) => settingsByUrl.get(url);
	const compactGroups = [
		{
			id: "dashboard",
			title: t("dashboard"),
			items: [pickDirect("/")],
		},
		{
			id: "users",
			title: t("users"),
			items: [pickDirect("/users")],
		},
		{
			id: "infrastructure",
			title: t("sidebar.groups.infrastructure"),
			items: [
				pickSetting("/node-settings"),
				pickSetting("/services"),
				pickSetting("/hosts"),
			],
		},
		{
			id: "admin",
			title: t("admins.admin"),
			items: [
				pickDirect("/admins"),
				pickDirect("/usage"),
				pickDirect("/myaccount"),
				pickDirect("/notifications"),
			],
		},
		{
			id: "system",
			title: t("sidebar.groups.system"),
			items: [
				pickSetting("/settings"),
				pickSetting("/xray-settings"),
				pickSetting("/xray-logs"),
				pickSetting("/errors"),
				pickSetting("/access-insights"),
				pickSetting("/recent-actions"),
				pickSetting("/phpmyadmin"),
				pickSetting("/placeholders"),
			],
		},
	].map((group) => ({
		...group,
		items: group.items.filter(Boolean) as SidebarItem[],
	}));

	const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
		try {
			const saved = localStorage.getItem("rb-sidebar-collapsed-groups");
			if (saved) return JSON.parse(saved);
		} catch {}
		return { system: true };
	});

	const isGroupActive = useCallback(
		(groupItems: SidebarItem[]) =>
			groupItems.some((item) => {
				if (!item.url) return false;
				return (
					location.pathname === item.url ||
					(item.url !== "/" && location.pathname.startsWith(item.url))
				);
			}),
		[location.pathname],
	);

	const isGroupOpen = (groupId: string, groupItems: SidebarItem[]) => {
		if (isGroupActive(groupItems)) return true;
		return !collapsedGroups[groupId];
	};

	const toggleGroup = (groupId: string, groupItems: SidebarItem[]) => {
		const currentlyOpen = isGroupOpen(groupId, groupItems);
		setCollapsedGroups((prev) => {
			const next = { ...prev, [groupId]: currentlyOpen };
			try {
				localStorage.setItem("rb-sidebar-collapsed-groups", JSON.stringify(next));
			} catch {}
			return next;
		});
	};

	const isRTL = i18n.dir(currentLanguage) === "rtl";

	return (
		<Box
			w={inDrawer ? "full" : collapsed ? "16" : "56"}
			h={inDrawer ? "100%" : "calc(100vh - 24px)"}
			maxH={inDrawer ? "100%" : "calc(100vh - 24px)"}
			bg={sidebarBg}
			borderWidth={inDrawer ? undefined : "1px"}
			borderColor={inDrawer ? undefined : sidebarBorderColor}
			borderRadius={inDrawer ? undefined : "2xl"}
			boxShadow={inDrawer ? undefined : sidebarShadow}
			transition="width 0.3s ease"
			position={inDrawer ? "relative" : "fixed"}
			top={inDrawer ? undefined : "12px"}
			left={inDrawer || isRTL ? undefined : "12px"}
			right={inDrawer || !isRTL ? undefined : "12px"}
			overflow="hidden"
			flexShrink={0}
			userSelect="none"
		>
			<VStack
				spacing={2}
				p={collapsed ? 2 : 4}
				align="stretch"
				h="100%"
				minH={0}
				justify="space-between"
			>
				<Box
					flex="1"
					minH={0}
					overflowY="auto"
					overflowX="hidden"
					className="rb-sidebar-scroll"
					data-dir={isRTL ? "rtl" : "ltr"}
					data-collapsed={collapsed ? "true" : "false"}
					dir={isRTL ? "rtl" : "ltr"}
				>
					<Box
						borderWidth="1px"
						borderColor="panel.border"
						borderRadius="14px"
						bg="panel.surface"
						position="relative"
						overflow="hidden"
						mb={4}
						px={collapsed ? 2 : 3}
						py={collapsed ? 2 : 3}
						boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 4px 14px -3px rgba(0, 0, 0, 0.2)"
						_before={{
							content: '""',
							position: "absolute",
							top: 0,
							left: 0,
							right: 0,
							height: "1.5px",
							bg: "linear-gradient(90deg, transparent, var(--rb-panel-accent), transparent)",
							opacity: 0.75,
						}}
					>
						<Flex align="center" gap={3} justify={collapsed ? "center" : "flex-start"}>
							<Image
								src={logoUrl}
								alt="Rebecca"
								w={8}
								h={8}
								objectFit="contain"
								borderRadius="md"
							/>
							{!collapsed && (
								<Text
									fontSize={{ base: "lg", md: "xl" }}
									fontWeight="bold"
									fontFamily="'Inter', system-ui, sans-serif"
									letterSpacing="tight"
									lineHeight="1"
									whiteSpace="nowrap"
									color="panel.text"
									noOfLines={1}
								>
									Rebecca
								</Text>
							)}
						</Flex>
					</Box>
					<VStack align="stretch" spacing={3}>
						{compactGroups.map((group) => {
							if (group.items.length === 0) return null;
							const isOpen = isGroupOpen(group.id, group.items);

							return (
								<Box key={group.id}>
									{collapsed ? (
										<Box
											borderTopWidth="1px"
											borderColor={subNavBorder}
											my={2}
											mx={2}
										/>
									) : (
										<Flex
											align="center"
											justify="space-between"
											px={2.5}
											py={1.5}
											mb={1}
											cursor="pointer"
											borderRadius="8px"
											userSelect="none"
											transition="all 0.2s ease"
											_hover={{
												bg: "var(--rb-panel-accent-subtle)",
												color: "panel.text",
											}}
											onClick={() => toggleGroup(group.id, group.items)}
										>
											<Text
												fontSize="10.5px"
												fontWeight="700"
												color="panel.textMuted"
												letterSpacing="0.06em"
												textTransform="uppercase"
											>
												{group.title}
											</Text>
											<Box
												as={ChevronDownIcon}
												w="3"
												h="3"
												color="panel.textMuted"
												transform={isOpen ? "rotate(0deg)" : isRTL ? "rotate(90deg)" : "rotate(-90deg)"}
												transition="transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
											/>
										</Flex>
									)}
									<Collapse in={collapsed ? true : isOpen} animateOpacity>
										<VStack align="stretch" spacing={1}>
											{group.items.map((item) => {
												if (!item.url) return null;
												const itemUrl = item.url;
												const isActive =
													location.pathname === itemUrl ||
													(itemUrl !== "/" &&
														location.pathname.startsWith(itemUrl));
												const Icon = item.icon;
												const showTutorialBadge =
													itemUrl === tutorialsUrl && hasNewTutorials;
												const navItem = (
													<Tooltip
														key={itemUrl}
														label={collapsed ? item.title : ""}
														placement={isRTL ? "left" : "right"}
														hasArrow
													>
														<HStack
															spacing={3}
															px={collapsed ? 2 : 3}
															py={2}
															minH="38px"
															borderRadius="10px"
															cursor="pointer"
															position="relative"
															bg={isActive ? "var(--rb-panel-accent-soft)" : "transparent"}
															color={isActive ? "var(--rb-panel-accent)" : itemColor}
															borderWidth="1px"
															borderColor={isActive ? "var(--rb-panel-accent-glow)" : "transparent"}
															boxShadow={
																isActive
																	? "0 0 14px -3px var(--rb-panel-accent-glow), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
																	: "none"
															}
															transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
															_hover={{
																bg: isActive
																	? "var(--rb-panel-accent-soft)"
																	: "var(--rb-panel-accent-subtle)",
																color: isActive
																	? "var(--rb-panel-accent)"
																	: "panel.text",
																transform: isRTL ? "translateX(-2px)" : "translateX(2px)",
															}}
															justifyContent={collapsed ? "center" : "flex-start"}
														>
															{isActive && (
																<Box
																	position="absolute"
																	top="7px"
																	bottom="7px"
																	left={isRTL ? undefined : "0"}
																	right={isRTL ? "0" : undefined}
																	w="3px"
																	borderRadius="full"
																	bg="var(--rb-panel-accent)"
																	boxShadow="0 0 8px var(--rb-panel-accent)"
																/>
															)}
															{showTutorialBadge && collapsed ? (
																<Box position="relative" display="inline-flex">
																	<Icon
																		w={collapsed ? 5 : undefined}
																		h={collapsed ? 5 : undefined}
																	/>
																	<Box
																		position="absolute"
																		top="-6px"
																		left={isRTL ? "-7px" : undefined}
																		right={isRTL ? undefined : "-7px"}
																		w="4"
																		h="4"
																		borderRadius="full"
																		bg="var(--rb-panel-accent)"
																		color="white"
																		border="2px solid"
																		borderColor={sidebarBg}
																		display="inline-flex"
																		alignItems="center"
																		justifyContent="center"
																	>
																		<TutorialUpdateIconStyled />
																	</Box>
																</Box>
															) : (
																<Icon
																	w={collapsed ? 5 : undefined}
																	h={collapsed ? 5 : undefined}
																/>
															)}
															{!collapsed && (
																<>
																	<Text
																		fontSize="sm"
																		fontWeight={isActive ? "700" : "500"}
																		noOfLines={1}
																	>
																		{item.title}
																	</Text>
																	{showTutorialBadge ? (
																		<Box
																			ml={isRTL ? undefined : "auto"}
																			mr={isRTL ? "auto" : undefined}
																			w="5"
																			h="5"
																			borderRadius="full"
																			bg="var(--rb-panel-accent)"
																			color="white"
																			display="inline-flex"
																			alignItems="center"
																			justifyContent="center"
																		>
																			<TutorialUpdateIconStyled />
																		</Box>
																	) : null}
																</>
															)}
														</HStack>
													</Tooltip>
												);

												return (
													<NavLink
														key={itemUrl}
														to={itemUrl}
														onClick={(e) => handleNavClick(e, itemUrl)}
													>
														{navItem}
													</NavLink>
												);
											})}
										</VStack>
									</Collapse>
								</Box>
							);
						})}
					</VStack>
				</Box>
			</VStack>
		</Box>
	);
};
