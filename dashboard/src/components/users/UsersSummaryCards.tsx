import {
	Box,
	Flex,
	HStack,
	SimpleGrid,
	Text,
} from "@chakra-ui/react";
import {
	ClockIcon,
	ShieldCheckIcon,
	SignalIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useDashboard } from "contexts/DashboardContext";
import type { FC, ReactNode } from "react";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes, numberWithCommas } from "utils/formatByte";

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const UsersRadialRing: FC<{
	percent: number;
	size?: number;
	strokeWidth?: number;
	id: string;
	gradStart?: string;
	gradEnd?: string;
	glowColor?: string;
	centerText?: string;
}> = ({
	percent,
	size = 52,
	strokeWidth = 4.5,
	id,
	gradStart = "var(--rb-panel-accent)",
	gradEnd = "var(--rb-panel-accent-hover)",
	glowColor = "var(--rb-panel-accent-glow)",
	centerText,
}) => {
	const safe = clampPercent(percent);
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const strokeDashoffset = circumference - (safe / 100) * circumference;

	return (
		<Box
			position="relative"
			w={`${size}px`}
			h={`${size}px`}
			display="flex"
			alignItems="center"
			justifyContent="center"
			flexShrink={0}
		>
			<Box
				position="absolute"
				w={`${size * 0.7}px`}
				h={`${size * 0.7}px`}
				borderRadius="full"
				bg={glowColor}
				filter="blur(8px)"
				opacity={0.35}
				pointerEvents="none"
			/>
			<svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
				<defs>
					<linearGradient id={`usersRing-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stopColor={gradStart} />
						<stop offset="100%" stopColor={gradEnd} />
					</linearGradient>
				</defs>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke="rgba(255, 255, 255, 0.08)"
					strokeWidth={strokeWidth}
					fill="none"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke={`url(#usersRing-${id})`}
					strokeWidth={strokeWidth}
					fill="none"
					strokeDasharray={circumference}
					strokeDashoffset={strokeDashoffset}
					strokeLinecap="round"
					style={{
						transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
						filter: `drop-shadow(0 0 6px ${glowColor}) drop-shadow(0 0 2px ${gradStart})`,
					}}
				/>
			</svg>
			<Flex
				position="absolute"
				inset={0}
				align="center"
				justify="center"
				pointerEvents="none"
				direction="column"
			>
				<Text
					fontSize={{ base: "10.5px", sm: "11px" }}
					fontWeight="800"
					color="panel.text"
					dir="ltr"
					sx={{ fontVariantNumeric: "tabular-nums" }}
					lineHeight="1"
				>
					{centerText ?? `${Math.round(safe)}%`}
				</Text>
			</Flex>
		</Box>
	);
};

const UserStatCard: FC<{
	label: string;
	icon: ReactNode;
	value: string | number;
	totalValue?: string | number;
	percent: number;
	beaconColor?: string;
	gradStart?: string;
	gradEnd?: string;
	glowColor?: string;
	badgeText?: string;
	footerText?: string;
	extraPills?: ReactNode;
	isRTL?: boolean;
}> = ({
	label,
	icon,
	value,
	totalValue,
	percent,
	beaconColor,
	gradStart,
	gradEnd,
	glowColor,
	badgeText,
	footerText,
	extraPills,
	isRTL = false,
}) => {
	const rawId = useId();
	const ringId = useMemo(() => rawId.replace(/[^a-zA-Z0-9]/g, ""), [rawId]);
	const accentBeacon = beaconColor || "var(--rb-panel-accent)";

	return (
		<Box
			role="group"
			bg="panel.surface"
			background="linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, rgba(255, 255, 255, 0.005) 100%), var(--chakra-colors-panel-surface)"
			backdropFilter="blur(16px)"
			borderWidth="1px"
			borderColor="panel.border"
			borderRadius={{ base: "14px", sm: "16px", md: "20px" }}
			p={{ base: 2.5, sm: 3.5, md: 5 }}
			position="relative"
			overflow="hidden"
			display="flex"
			flexDirection="column"
			justifyContent="space-between"
			boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px -6px rgba(0, 0, 0, 0.16)"
			transition="all 0.35s cubic-bezier(0.16, 1, 0.3, 1)"
			_before={{
				content: '""',
				position: "absolute",
				top: 0,
				left: "8%",
				right: "8%",
				height: "2px",
				bg: "linear-gradient(90deg, transparent, var(--rb-panel-accent), var(--rb-panel-accent-glow), transparent)",
				opacity: 0.85,
				transition: "opacity 0.35s ease",
			}}
			_hover={{
				md: {
					transform: "translateY(-4px)",
					borderColor: "var(--rb-panel-accent-glow)",
					bg: "panel.elevated",
					boxShadow:
						"0 16px 36px -6px rgba(0, 0, 0, 0.45), 0 0 26px -4px var(--rb-panel-accent-glow), inset 0 1px 1px 0 rgba(255, 255, 255, 0.09)",
				},
			}}
		>
			<Box>
				{/* Header */}
				<Flex justify="space-between" align="center" mb={{ base: 2, sm: 2.5, md: 3 }}>
					<HStack spacing={{ base: 1.5, sm: 2.5 }} align="center" minW={0}>
						<Flex
							w={{ base: "26px", sm: "28px", md: "32px" }}
							h={{ base: "26px", sm: "28px", md: "32px" }}
							align="center"
							justify="center"
							borderRadius={{ base: "7px", sm: "8px", md: "9px" }}
							bg="var(--rb-panel-accent-soft)"
							borderWidth="1px"
							borderColor="var(--rb-panel-accent-glow)"
							color="var(--rb-panel-accent)"
							boxShadow="0 0 12px -2px var(--rb-panel-accent-glow)"
							flexShrink={0}
							transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
							_groupHover={{
								transform: "scale(1.1)",
								boxShadow: "0 0 18px var(--rb-panel-accent-glow)",
							}}
						>
							{icon}
						</Flex>
						<Text
							fontSize={{ base: "11px", sm: "12px", md: "13px" }}
							fontWeight="600"
							color="panel.textSecondary"
							noOfLines={1}
						>
							{label}
						</Text>
					</HStack>

					{badgeText && (
						<Flex
							align="center"
							gap={1}
							px={{ base: 1.5, sm: 2 }}
							py={0.5}
							borderRadius="full"
							bg="var(--rb-panel-accent-soft)"
							borderWidth="1px"
							borderColor="var(--rb-panel-accent-glow)"
							color="var(--rb-panel-accent)"
							boxShadow="0 0 8px -2px var(--rb-panel-accent-glow)"
							fontSize={{ base: "9.5px", sm: "10.5px" }}
							fontWeight="700"
							flexShrink={0}
							sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
						>
							{badgeText}
						</Flex>
					)}
				</Flex>

				{/* Center Value & Ring */}
				<Flex align="center" justify="space-between" gap={2} my={{ base: 1, sm: 1.5 }}>
					<Box minW={0} flex="1">
						<Flex align="baseline" gap={1.5} flexWrap="wrap">
							<Text
								fontSize={{ base: "18px", sm: "20px", md: "24px" }}
								fontWeight="800"
								color="panel.text"
								letterSpacing="-0.02em"
								lineHeight="1.15"
								dir="ltr"
								sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
								noOfLines={1}
							>
								{value}
							</Text>
							<Box
								as="span"
								display="inline-block"
								w="6px"
								h="6px"
								borderRadius="full"
								bg={accentBeacon}
								boxShadow={`0 0 8px ${accentBeacon}`}
								alignSelf="center"
								sx={{
									animation: "pulseBeacon 2.6s ease-in-out infinite",
									"@keyframes pulseBeacon": {
										"0%, 100%": { opacity: 0.5, transform: "scale(0.9)" },
										"50%": {
											opacity: 1,
											transform: "scale(1.3)",
											boxShadow: `0 0 12px ${accentBeacon}`,
										},
									},
								}}
							/>
							{totalValue !== undefined && (
								<Text
									fontSize={{ base: "11px", sm: "12px", md: "13px" }}
									fontWeight="600"
									color="panel.textMuted"
									dir="ltr"
									sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
									noOfLines={1}
								>
									/ {totalValue}
								</Text>
							)}
						</Flex>

						{extraPills && <Box mt={1.5}>{extraPills}</Box>}
					</Box>

					<UsersRadialRing
						percent={percent}
						id={ringId}
						gradStart={gradStart}
						gradEnd={gradEnd}
						glowColor={glowColor}
					/>
				</Flex>
			</Box>

			{/* Footer */}
			{footerText && (
				<Box
					pt={{ base: 2, sm: 2.5 }}
					mt={{ base: 1.5, sm: 2 }}
					borderTopWidth="1px"
					borderColor="panel.border"
					fontSize={{ base: "10px", sm: "11px" }}
					fontWeight="500"
					color="panel.textMuted"
					dir={isRTL ? "rtl" : "ltr"}
					noOfLines={1}
				>
					{footerText}
				</Box>
			)}
		</Box>
	);
};

export const UsersSummaryCards: FC = () => {
	const { t, i18n } = useTranslation();
	const isRTL = i18n.dir(i18n.language) === "rtl";
	const users = useDashboard((state) => state.users);
	const liveUserStats = useDashboard((state) => state.liveUserStats);

	const totalUsers = users.total ?? 0;
	const usersLimit = users.users_limit ?? null;
	const activeUsers =
		users.active_total ?? users.status_breakdown?.active ?? 0;
	const onlineUsers =
		users.online_total ??
		Object.values(liveUserStats || {}).filter((s) => s.is_online).length;

	const breakdown = users.status_breakdown || {};
	const onHoldUsers = breakdown.on_hold ?? 0;
	const limitedUsers = breakdown.limited ?? 0;
	const expiredUsers = breakdown.expired ?? 0;
	const attentionUsers = onHoldUsers + limitedUsers + expiredUsers;
	const usageTotal = users.usage_total ?? 0;

	// Percentages
	const totalPercent =
		usersLimit && usersLimit > 0
			? (totalUsers / usersLimit) * 100
			: totalUsers > 0
				? (activeUsers / totalUsers) * 100
				: 0;

	const activePercent =
		totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

	const onlinePercent =
		totalUsers > 0 ? Math.round((onlineUsers / totalUsers) * 100) : 0;

	const attentionPercent =
		totalUsers > 0 ? Math.round((attentionUsers / totalUsers) * 100) : 0;

	return (
		<SimpleGrid
			columns={{ base: 2, md: 4 }}
			gap={{ base: 2.5, sm: 3, md: 4 }}
			w="full"
		>
			{/* Card 1: Total Users */}
			<UserStatCard
				label={isRTL ? "کل کاربران" : "Total Users"}
				icon={<UserGroupIcon width={16} />}
				value={numberWithCommas(totalUsers)}
				totalValue={usersLimit ? numberWithCommas(usersLimit) : undefined}
				percent={totalPercent}
				badgeText={
					usersLimit
						? `${Math.round(totalPercent)}%`
						: usageTotal > 0
							? formatBytes(usageTotal, 1)
							: undefined
				}
				footerText={
					usersLimit
						? (isRTL
								? `• ${Math.round(totalPercent)}٪ از سقف مجاز کاربران`
								: `• ${Math.round(totalPercent)}% of user quota`)
						: (usageTotal > 0
								? (isRTL
										? `• ${formatBytes(usageTotal, 1)} مصرف کل کاربران`
										: `• ${formatBytes(usageTotal, 1)} total usage`)
								: undefined)
				}
				isRTL={isRTL}
			/>

			{/* Card 2: Active Users */}
			<UserStatCard
				label={isRTL ? "کاربران فعال" : "Active Users"}
				icon={<ShieldCheckIcon width={16} />}
				value={numberWithCommas(activeUsers)}
				totalValue={numberWithCommas(totalUsers)}
				percent={activePercent}
				beaconColor="#10b981"
				gradStart="#10b981"
				gradEnd="#34d399"
				glowColor="rgba(16, 185, 129, 0.4)"
				badgeText={`${activePercent}%`}
				footerText={
					isRTL
						? `• ${activePercent}٪ از کل کاربران فعال هستند`
						: `• ${activePercent}% of total users active`
				}
				isRTL={isRTL}
			/>

			{/* Card 3: Online Users */}
			<UserStatCard
				label={isRTL ? "کاربران آنلاین" : "Online Users"}
				icon={<SignalIcon width={16} />}
				value={numberWithCommas(onlineUsers)}
				percent={onlinePercent}
				beaconColor="#06b6d4"
				gradStart="#06b6d4"
				gradEnd="#38bdf8"
				glowColor="rgba(6, 182, 212, 0.4)"
				badgeText={
					onlineUsers > 0
						? (isRTL ? `${onlineUsers} آنلاین` : `${onlineUsers} live`)
						: (isRTL ? "غیرفعال" : "idle")
				}
				footerText={
					onlineUsers > 0
						? (isRTL ? "• متصل در لحظه" : "• Active sessions now")
						: (isRTL ? "• بدون اتصال فعال" : "• No active connections")
				}
				isRTL={isRTL}
			/>

			{/* Card 4: Subscription Status & Attention */}
			<UserStatCard
				label={isRTL ? "وضعیت اشتراک‌ها" : "Subscriptions"}
				icon={<ClockIcon width={16} />}
				value={numberWithCommas(attentionUsers)}
				percent={attentionPercent}
				beaconColor={attentionUsers > 0 ? "#f59e0b" : "#10b981"}
				gradStart={attentionUsers > 0 ? "#f59e0b" : "#10b981"}
				gradEnd={attentionUsers > 0 ? "#fbbf24" : "#34d399"}
				glowColor={
					attentionUsers > 0
						? "rgba(245, 158, 11, 0.4)"
						: "rgba(16, 185, 129, 0.4)"
				}
				badgeText={
					attentionUsers > 0
						? (isRTL ? `${attentionUsers} نیاز به اقدام` : `${attentionUsers} alert`)
						: (isRTL ? "سالم" : "Healthy")
				}
				extraPills={
					<HStack spacing={2} align="center" flexWrap="wrap">
						{onHoldUsers > 0 && (
							<HStack spacing={1} align="center" fontSize="10.5px" color="purple.400">
								<Box w="5px" h="5px" borderRadius="full" bg="purple.400" />
								<Text as="span" fontWeight="700">
									{onHoldUsers}
								</Text>
								<Text as="span">{isRTL ? "انتظار" : "On Hold"}</Text>
							</HStack>
						)}
						{limitedUsers > 0 && (
							<HStack spacing={1} align="center" fontSize="10.5px" color="red.400">
								<Box w="5px" h="5px" borderRadius="full" bg="red.400" />
								<Text as="span" fontWeight="700">
									{limitedUsers}
								</Text>
								<Text as="span">{isRTL ? "محدود" : "Limited"}</Text>
							</HStack>
						)}
						{expiredUsers > 0 && (
							<HStack spacing={1} align="center" fontSize="10.5px" color="yellow.400">
								<Box w="5px" h="5px" borderRadius="full" bg="yellow.400" />
								<Text as="span" fontWeight="700">
									{expiredUsers}
								</Text>
								<Text as="span">{isRTL ? "منقضی" : "Expired"}</Text>
							</HStack>
						)}
					</HStack>
				}
				footerText={
					attentionUsers > 0
						? (isRTL
								? "• اشتراک‌های نیازمند پیگیری و تمدید"
								: "• Subscriptions requiring renewal")
						: (isRTL
								? "• تمامی اشتراک‌ها پایدار هستند"
								: "• All subscriptions healthy")
				}
				isRTL={isRTL}
			/>

		</SimpleGrid>
	);
};
