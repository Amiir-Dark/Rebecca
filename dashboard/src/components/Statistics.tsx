import {
	Box,
	type BoxProps,
	Button,
	Flex,
	HStack,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalHeader,
	ModalOverlay,
	Progress,
	SimpleGrid,
	Spinner,
	Stack,
	Text,
	VStack,
	useColorMode,
	useColorModeValue,
} from "@chakra-ui/react";
import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	CircleStackIcon,
	ClockIcon,
	CpuChipIcon,
	ServerStackIcon,
	ShieldCheckIcon,
	SignalIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { ApexOptions } from "apexcharts";
import { useDashboard } from "contexts/DashboardContext";
import { AnimatePresence, motion } from "framer-motion";
import useGetUser from "hooks/useGetUser";
import type { TFunction } from "i18next";
import {
	type FC,
	lazy,
	type ReactNode,
	Suspense,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "react-query";
import { fetch, reportAPIError, useAPIRequestErrors } from "service/http";
import { AdminRole } from "types/Admin";
import type { SystemStats } from "types/System";
import type { UsersListResponse } from "types/User";
import { formatBytes, numberWithCommas } from "utils/formatByte";
import { mergeLiveSystemStats } from "utils/systemMetrics";
import { dashboardDiagnostics } from "utils/diagnostics";
import { getAPIWebSocketURL } from "utils/websocket";
import { DashboardMaintenanceControls } from "./DashboardMaintenanceControls";
import { SystemDiagnostics, useSystemDiagnostics } from "./SystemDiagnostics";

export const StatisticsQueryKey = "statistics-query-key";

const HistoryChart = lazy(() => import("react-apexcharts"));

type MaintenanceInfo = {
	panel?: {
		image?: string;
		tag?: string | null;
		mode?: string;
		install_mode?: string;
		channel?: string;
		update?: {
			current?: string | null;
			available?: boolean;
			target?: string | null;
			latest_release?: { tag?: string | null } | null;
			latest_dev?: { tag?: string | null } | null;
			error?: string | null;
		} | null;
	} | null;
};

const formatDurationText = (seconds: number, t: TFunction): string => {
	if (!seconds || seconds <= 0) {
		return `0 ${t("dashboard.system.durationSeconds")}`;
	}

	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remSeconds = Math.floor(seconds % 60);

	const andWord = t("dashboard.system.durationAnd");
	const commaWord = t("dashboard.system.durationComma");

	const formatUnit = (val: number, singleKey: string, pluralKey: string) => {
		const unitStr = val === 1 ? t(singleKey) : t(pluralKey);
		return `${val} ${unitStr}`;
	};

	if (days > 0) {
		const parts: string[] = [formatUnit(days, "dashboard.system.durationDay", "dashboard.system.durationDays")];
		if (hours > 0) {
			parts.push(formatUnit(hours, "dashboard.system.durationHour", "dashboard.system.durationHours"));
		}
		if (minutes > 0) {
			parts.push(formatUnit(minutes, "dashboard.system.durationMinute", "dashboard.system.durationMinutes"));
		}
		if (parts.length === 1) return parts[0];
		if (parts.length === 2) return parts.join(andWord);
		return parts.slice(0, -1).join(commaWord) + andWord + parts[parts.length - 1];
	}

	if (hours > 0) {
		const hStr = formatUnit(hours, "dashboard.system.durationHour", "dashboard.system.durationHours");
		if (minutes > 0) {
			const mStr = formatUnit(minutes, "dashboard.system.durationMinute", "dashboard.system.durationMinutes");
			return `${hStr}${andWord}${mStr}`;
		}
		return hStr;
	}

	if (minutes > 0) {
		const mStr = formatUnit(minutes, "dashboard.system.durationMinute", "dashboard.system.durationMinutes");
		if (remSeconds > 0) {
			const sStr = formatUnit(remSeconds, "dashboard.system.durationSecond", "dashboard.system.durationSeconds");
			return `${mStr}${andWord}${sStr}`;
		}
		return mStr;
	}

	return formatUnit(remSeconds, "dashboard.system.durationSecond", "dashboard.system.durationSeconds");
};

const formatLocalizedDuration = (
	seconds: number,
	t: TFunction,
	isRTL = false,
): ReactNode => {
	const text = formatDurationText(seconds, t);
	return (
		<Text
			fontSize="13px"
			fontWeight="700"
			letterSpacing="-0.01em"
			color="panel.text"
			dir={isRTL ? "rtl" : "ltr"}
			sx={{ unicodeBidi: "isolate", fontVariantNumeric: "tabular-nums" }}
		>
			{text}
		</Text>
	);
};

const useSystemMetricsStream = (enabled = true) => {
	const queryClient = useQueryClient();
	useEffect(() => {
		if (!enabled || typeof window === "undefined") return;
		const url = getAPIWebSocketURL("/system/metrics", { interval: 3 });
		if (!url) return;
		let closed = false;
		let ws: WebSocket | null = null;
		let reconnectTimer: number | undefined;

		const connect = () => {
			ws = new WebSocket(url);
			ws.onmessage = (event) => {
				try {
					const payload = JSON.parse(event.data);
					if (payload?.error) {
						reportAPIError("STREAM /system/metrics", payload);
						return;
					}
					const stats = payload?.stats ?? payload;
					if (!stats || typeof stats !== "object" || !("version" in stats)) return;
					useAPIRequestErrors.getState().clear("STREAM /system/metrics");
					queryClient.setQueryData<SystemStats>(StatisticsQueryKey, (current) =>
						mergeLiveSystemStats(current, stats),
					);
				} catch (error) {
					console.error("Unable to parse system metrics stream payload", error);
				}
			};
			ws.onerror = () => ws?.close();
			ws.onclose = () => {
				if (!closed) reconnectTimer = window.setTimeout(connect, 3000);
			};
		};

		connect();
		return () => {
			closed = true;
			if (reconnectTimer) window.clearTimeout(reconnectTimer);
			ws?.close();
		};
	}, [enabled, queryClient]);
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
	const next = Number(value);
	return Number.isFinite(next) ? next : fallback;
};

const safeHistory = (value: unknown): SystemStats["cpu_history"] =>
	Array.isArray(value)
		? value.map((entry) => ({
				timestamp: toFiniteNumber((entry as any)?.timestamp),
				value: toFiniteNumber((entry as any)?.value),
			}))
		: [];

const safeNetworkHistory = (value: unknown): SystemStats["network_history"] =>
	Array.isArray(value)
		? value.map((entry) => ({
				timestamp: toFiniteNumber((entry as any)?.timestamp),
				incoming: toFiniteNumber((entry as any)?.incoming),
				outgoing: toFiniteNumber((entry as any)?.outgoing),
			}))
		: [];

const safeUsageStats = (value: unknown): SystemStats["memory"] => {
	const raw = value && typeof value === "object" ? (value as any) : {};
	return {
		current: toFiniteNumber(raw.current),
		total: toFiniteNumber(raw.total),
		percent: toFiniteNumber(raw.percent),
	};
};

const sanitizeSystemStats = (value: SystemStats | undefined): SystemStats | null => {
	if (!value || typeof value !== "object") return null;
	const raw = value as any;
	return {
		...value,
		version: String(raw.version ?? ""),
		os: typeof raw.os === "string" ? raw.os : undefined,
		cpu_cores: toFiniteNumber(raw.cpu_cores),
		cpu_threads: toFiniteNumber(raw.cpu_threads),
		cpu_frequency_hz: toFiniteNumber(raw.cpu_frequency_hz),
		cpu_usage: toFiniteNumber(raw.cpu_usage),
		total_user: toFiniteNumber(raw.total_user),
		online_users: toFiniteNumber(raw.online_users),
		online_users_usage: toFiniteNumber(raw.online_users_usage),
		online_users_upload_speed: toFiniteNumber(raw.online_users_upload_speed),
		online_users_download_speed: toFiniteNumber(raw.online_users_download_speed),
		users_active: toFiniteNumber(raw.users_active),
		users_on_hold: toFiniteNumber(raw.users_on_hold),
		users_disabled: toFiniteNumber(raw.users_disabled),
		users_expired: toFiniteNumber(raw.users_expired),
		users_limited: toFiniteNumber(raw.users_limited),
		incoming_bandwidth: toFiniteNumber(raw.incoming_bandwidth),
		outgoing_bandwidth: toFiniteNumber(raw.outgoing_bandwidth),
		panel_total_bandwidth: toFiniteNumber(raw.panel_total_bandwidth),
		incoming_bandwidth_speed: toFiniteNumber(raw.incoming_bandwidth_speed),
		outgoing_bandwidth_speed: toFiniteNumber(raw.outgoing_bandwidth_speed),
		memory: safeUsageStats(raw.memory),
		swap: safeUsageStats(raw.swap),
		disk: safeUsageStats(raw.disk),
		load_avg: Array.isArray(raw.load_avg) ? raw.load_avg.map((item: unknown) => toFiniteNumber(item)) : [],
		uptime_seconds: toFiniteNumber(raw.uptime_seconds),
		panel_uptime_seconds: toFiniteNumber(raw.panel_uptime_seconds),
		xray_uptime_seconds: toFiniteNumber(raw.xray_uptime_seconds),
		xray_running: Boolean(raw.xray_running),
		xray_version: raw.xray_version ?? null,
		app_memory: toFiniteNumber(raw.app_memory),
		app_threads: toFiniteNumber(raw.app_threads),
		panel_cpu_percent: toFiniteNumber(raw.panel_cpu_percent),
		panel_memory_percent: toFiniteNumber(raw.panel_memory_percent),
		cpu_history: safeHistory(raw.cpu_history),
		memory_history: safeHistory(raw.memory_history),
		swap_history: safeHistory(raw.swap_history),
		disk_history: safeHistory(raw.disk_history),
		network_history: safeNetworkHistory(raw.network_history),
		panel_cpu_history: safeHistory(raw.panel_cpu_history),
		panel_memory_history: safeHistory(raw.panel_memory_history),
		personal_usage:
			raw.personal_usage && typeof raw.personal_usage === "object"
				? {
						total_users: toFiniteNumber(raw.personal_usage.total_users),
						consumed_bytes: toFiniteNumber(raw.personal_usage.consumed_bytes),
						built_bytes: toFiniteNumber(raw.personal_usage.built_bytes),
						reset_bytes: toFiniteNumber(raw.personal_usage.reset_bytes),
						traffic_basis: raw.personal_usage.traffic_basis,
					}
				: {
						total_users: 0,
						consumed_bytes: 0,
						built_bytes: 0,
						reset_bytes: 0,
						traffic_basis: "used_traffic",
					},
		admin_overview:
			raw.admin_overview && typeof raw.admin_overview === "object"
				? {
						total_admins: toFiniteNumber(raw.admin_overview.total_admins),
						sudo_admins: toFiniteNumber(raw.admin_overview.sudo_admins),
						full_access_admins: toFiniteNumber(
							raw.admin_overview.full_access_admins,
						),
						standard_admins: toFiniteNumber(raw.admin_overview.standard_admins),
						top_admin_username: raw.admin_overview.top_admin_username ?? null,
						top_admin_usage: toFiniteNumber(raw.admin_overview.top_admin_usage),
					}
				: {
						total_admins: 0,
						sudo_admins: 0,
						full_access_admins: 0,
						standard_admins: 0,
						top_admin_username: null,
						top_admin_usage: 0,
					},
	};
};

const formatNumberValue = (value?: number | null) => numberWithCommas(value);
const formatPercent = (val: number, _isRTL = false): string => {
	if (!Number.isFinite(val)) return "0%";
	const rounded = Math.round(val * 10) / 10;
	const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
	return `${formatted}%`;
};
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const HISTORY_INTERVALS = [
	{ labelKey: "dashboard.history.interval.2m", seconds: 120 },
	{ labelKey: "dashboard.history.interval.10m", seconds: 600 },
	{ labelKey: "dashboard.history.interval.30m", seconds: 1800 },
	{ labelKey: "dashboard.history.interval.1h", seconds: 3600 },
	{ labelKey: "dashboard.history.interval.3h", seconds: 10800 },
	{ labelKey: "dashboard.history.interval.5h", seconds: 18000 },
];

type HistoryModalPayload = {
	type: "cpu" | "memory" | "network" | "panel" | "panelCpu" | "panelMemory";
	title: string;
	metricLabel?: string;
	entries?: Array<{ timestamp: number; value: number }>;
	networkEntries?: SystemStats["network_history"];
	cpuEntries?: SystemStats["panel_cpu_history"];
	memoryEntries?: SystemStats["panel_memory_history"];
};

const expandShortData = <T extends { timestamp: number }>(entries: T[]): T[] => {
	if (entries.length === 1) {
		const single = entries[0];
		const synthesizedBefore = { ...single, timestamp: single.timestamp - 2 };
		return [synthesizedBefore, single];
	}
	return entries;
};

const HistoryModal: FC<{
	isOpen: boolean;
	onClose: () => void;
	payload: HistoryModalPayload | null;
	intervalSeconds: number;
	onIntervalChange: (value: number) => void;
	t: TFunction;
	isRTL?: boolean;
}> = ({ isOpen, onClose, payload, intervalSeconds, onIntervalChange, t, isRTL = false }) => {
	const { colorMode } = useColorMode();
	const [isSwitchingInterval, setIsSwitchingInterval] = useState(false);
	const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
	const [pillStyle, setPillStyle] = useState<{ left: number; width: number }>({ left: 4, width: 0 });
	const gridColor = useColorModeValue("rgba(0,0,0,0.06)", "rgba(255,255,255,0.06)");
	const mutedTextColor = useColorModeValue("#64748b", "#94a3b8");

	const activeIntervalIndex = HISTORY_INTERVALS.findIndex((i) => i.seconds === intervalSeconds);

	useEffect(() => {
		if (!isOpen) return;
		const timer = setTimeout(() => {
			const targetEl = tabRefs.current[activeIntervalIndex];
			if (targetEl) {
				setPillStyle({
					left: targetEl.offsetLeft,
					width: targetEl.offsetWidth,
				});
			}
		}, 50);
		return () => clearTimeout(timer);
	}, [activeIntervalIndex, isOpen]);

	const { latestTimestamp, availableSpan } = useMemo(() => {
		if (!payload) {
			const now = Math.floor(Date.now() / 1000);
			return { latestTimestamp: now, earliestTimestamp: now - 120, availableSpan: 120 };
		}
		let timestamps: number[] = [];
		if (payload.type === "network" && payload.networkEntries?.length) {
			timestamps = payload.networkEntries.map((e) => e.timestamp);
		} else if (payload.type === "panel") {
			const cTs = (payload.cpuEntries || []).map((e) => e.timestamp);
			const mTs = (payload.memoryEntries || []).map((e) => e.timestamp);
			timestamps = [...cTs, ...mTs];
		} else if (payload.entries?.length) {
			timestamps = payload.entries.map((e) => e.timestamp);
		}

		if (!timestamps.length) {
			const now = Math.floor(Date.now() / 1000);
			return { latestTimestamp: now, earliestTimestamp: now - 120, availableSpan: 120 };
		}
		const maxT = Math.max(...timestamps);
		const minT = Math.min(...timestamps);
		return { latestTimestamp: maxT, earliestTimestamp: minT, availableSpan: Math.max(1, maxT - minT) };
	}, [payload]);

	const effectiveSpan =
		intervalSeconds === 120
			? Math.min(120, availableSpan)
			: Math.max(intervalSeconds * 0.5, Math.min(intervalSeconds, availableSpan));

	const cutoff = latestTimestamp - effectiveSpan;

	const { chartSeries, actualMinTs, actualMaxTs } = useMemo(() => {
		if (!payload) return { chartSeries: [], actualMinTs: cutoff, actualMaxTs: latestTimestamp };

		let seriesList: { name: string; data: [number, number][] }[] = [];
		let allTs: number[] = [];

		if (payload.type === "network" && payload.networkEntries) {
			const filtered = payload.networkEntries.filter((e) => e.timestamp >= cutoff);
			const rawData = filtered.length >= 1 ? filtered : payload.networkEntries;
			const finalData = expandShortData(rawData);
			allTs = finalData.map((e) => e.timestamp);
			seriesList = [
				{
					name: t("dashboard.system.networkIncoming"),
					data: finalData.map((e) => [e.timestamp * 1000, e.incoming]),
				},
				{
					name: t("dashboard.system.networkOutgoing"),
					data: finalData.map((e) => [e.timestamp * 1000, e.outgoing]),
				},
			];
		} else if (payload.type === "panel") {
			const filteredCpu = (payload.cpuEntries || []).filter((e) => e.timestamp >= cutoff);
			const filteredMem = (payload.memoryEntries || []).filter((e) => e.timestamp >= cutoff);
			const rawCpu = filteredCpu.length >= 1 ? filteredCpu : payload.cpuEntries || [];
			const rawMem = filteredMem.length >= 1 ? filteredMem : payload.memoryEntries || [];
			const finalCpu = expandShortData(rawCpu);
			const finalMem = expandShortData(rawMem);
			allTs = [...finalCpu.map((e) => e.timestamp), ...finalMem.map((e) => e.timestamp)];
			seriesList = [
				{
					name: `${t("dashboard.system.cpuUsage")} (Panel CPU %)`,
					data: finalCpu.map((e) => [e.timestamp * 1000, e.value]),
				},
				{
					name: `${t("dashboard.system.memoryUsage")} (Panel RAM %)`,
					data: finalMem.map((e) => [e.timestamp * 1000, e.value]),
				},
			];
		} else if (payload.entries) {
			const filtered = payload.entries.filter((e) => e.timestamp >= cutoff);
			const rawEntries = filtered.length >= 1 ? filtered : payload.entries;
			const finalEntries = expandShortData(rawEntries);
			allTs = finalEntries.map((e) => e.timestamp);
			seriesList = [
				{
					name: payload.metricLabel ?? payload.title,
					data: finalEntries.map((e) => [e.timestamp * 1000, e.value]),
				},
			];
		}

		const minTs = allTs.length ? Math.min(...allTs) : cutoff;
		const maxTs = allTs.length ? Math.max(...allTs) : latestTimestamp;

		return {
			chartSeries: seriesList,
			actualMinTs: minTs,
			actualMaxTs: maxTs,
		};
	}, [payload, cutoff, latestTimestamp, t]);

	const hasEnoughPoints = useMemo(() => {
		if (!payload) return false;
		let totalPoints = 0;
		if (payload.type === "network" && payload.networkEntries) {
			totalPoints = payload.networkEntries.filter((e) => e.timestamp >= cutoff).length;
		} else if (payload.type === "panel") {
			const cLen = (payload.cpuEntries || []).filter((e) => e.timestamp >= cutoff).length;
			const mLen = (payload.memoryEntries || []).filter((e) => e.timestamp >= cutoff).length;
			totalPoints = Math.max(cLen, mLen);
		} else if (payload.entries) {
			totalPoints = payload.entries.filter((e) => e.timestamp >= cutoff).length;
		}
		return totalPoints >= 2;
	}, [payload, cutoff]);

	const isNetwork = payload?.type === "network";

	const { computedMin, computedMax } = useMemo(() => {
		if (isNetwork || !chartSeries.length) {
			return { computedMin: undefined, computedMax: undefined };
		}
		let maxVal = 0;
		let minVal = 100;
		for (const series of chartSeries) {
			for (const pt of series.data) {
				const v = pt[1];
				if (Number.isFinite(v)) {
					if (v > maxVal) maxVal = v;
					if (v < minVal) minVal = v;
				}
			}
		}
		if (maxVal === 0 && minVal === 100) {
			return { computedMin: 0, computedMax: 10 };
		}
		const dynamicMax = Math.min(100, Math.ceil(maxVal * 1.15) || 10);
		const dynamicMin = Math.max(0, Math.floor(minVal * 0.85));
		return {
			computedMin: dynamicMin,
			computedMax: dynamicMax,
		};
	}, [isNetwork, chartSeries]);

	const options: ApexOptions = useMemo(
		() => ({
			chart: {
				type: "area",
				animations: {
					enabled: true,
					easing: "easeinout",
					speed: 300,
					animateGradually: { enabled: true, delay: 50 },
					dynamicAnimation: { enabled: true, speed: 250 },
				},
				toolbar: { show: false },
				zoom: { enabled: false },
				background: "transparent",
				fontFamily: "inherit",
				sparkline: { enabled: false },
			},
			colors: isNetwork
				? ["#3b82f6", "#10b981"]
				: ["var(--rb-panel-accent)", "#8b5cf6", "#f59e0b", "#ec4899"],
			fill: {
				type: "gradient",
				gradient: {
					shadeIntensity: 1,
					opacityFrom: 0.28,
					opacityTo: 0.02,
					stops: [0, 100],
				},
			},
			dataLabels: { enabled: false },
			theme: { mode: colorMode },
			stroke: { curve: "smooth", width: 2 },
			grid: {
				borderColor: gridColor,
				strokeDashArray: 3,
				xaxis: { lines: { show: false } },
				yaxis: { lines: { show: true } },
				padding: {
					top: 0,
					right: 8,
					bottom: 12,
					left: 5,
				},
			},
			xaxis: {
				type: "numeric",
				min: actualMinTs * 1000,
				max: actualMaxTs * 1000,
				tickAmount: 5,
				axisBorder: { show: false },
				axisTicks: { show: false },
				labels: {
					style: { colors: mutedTextColor, fontSize: "11px", fontFamily: "inherit" },
					hideOverlappingLabels: true,
					formatter: (val: string, timestamp?: number) => {
						const num = timestamp !== undefined ? timestamp : Number(val);
						if (!num || !Number.isFinite(num)) return val || "";
						const d = new Date(num);
						const h = String(d.getHours()).padStart(2, "0");
						const m = String(d.getMinutes()).padStart(2, "0");
						const s = String(d.getSeconds()).padStart(2, "0");
						return intervalSeconds === 120 ? `${h}:${m}:${s}` : `${h}:${m}`;
					},
				},
			},
			yaxis: {
				min: isNetwork ? undefined : computedMin,
				max: isNetwork ? undefined : computedMax,
				forceNiceScale: isNetwork,
				tickAmount: 5,
				labels: {
					offsetX: 0,
					style: { colors: mutedTextColor, fontSize: "11px", fontFamily: "inherit" },
					formatter: (val: number) => {
						if (!Number.isFinite(val)) return "0";
						if (isNetwork) {
							return formatBytes(val, 1);
						}
						return `${Math.round(val * 10) / 10}%`;
					},
				},
			},
			legend: {
				position: "bottom",
				offsetY: 0,
				labels: { colors: mutedTextColor },
				itemMargin: { horizontal: 8, vertical: 6 },
				markers: {
					offsetX: 0,
					offsetY: 0,
				},
				formatter: (seriesName: string) => seriesName,
				onItemClick: {
					toggleDataSeries: true,
				},
				onItemHover: {
					highlightDataSeries: true,
				},
			},
			tooltip: {
				custom: ({ series, seriesIndex, dataPointIndex, w }) => {
					const timestamp = w.globals.seriesX[seriesIndex]?.[dataPointIndex];
					const dateStr = timestamp
						? new Date(timestamp).toLocaleTimeString(isRTL ? "fa-IR" : "en-US", {
								hour12: false,
								hour: "2-digit",
								minute: "2-digit",
								second: "2-digit",
							})
						: "";

					const linesHtml = w.globals.seriesNames
						.map((name: string, i: number) => {
							const val = series[i]?.[dataPointIndex];
							if (val === undefined || Number.isNaN(val)) return "";
							const color = w.globals.colors[i] || "var(--rb-panel-accent)";
							const displayVal = isNetwork ? `${formatBytes(val, 2)}/s` : `${Math.round(val * 10) / 10}%`;
							return `
								<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px;">
									<div style="display: flex; align-items: center; gap: 6px;">
										<span style="width: 7px; height: 7px; border-radius: 50%; background: ${color}; box-shadow: 0 0 6px ${color}88; flex-shrink: 0;"></span>
										<span style="color: var(--chakra-colors-panel-textSecondary, #94a3b8); font-size: 11px; font-weight: 500;">${name}</span>
									</div>
									<span style="color: var(--chakra-colors-panel-text, #ffffff); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; direction: ltr;">${displayVal}</span>
								</div>
							`;
						})
						.join("");

					return `
						<div style="
							background: rgba(22, 23, 28, 0.92);
							backdrop-filter: blur(16px);
							-webkit-backdrop-filter: blur(16px);
							border: 1px solid rgba(255, 255, 255, 0.12);
							border-radius: 12px;
							background-clip: padding-box;
							padding: 8px 12px;
							box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.6);
							direction: ${isRTL ? "rtl" : "ltr"};
							font-family: inherit;
							min-width: 140px;
						">
							<div style="color: var(--chakra-colors-panel-textMuted, #64748b); font-size: 10px; font-weight: 600; direction: ltr; text-align: ${isRTL ? "right" : "left"}; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 4px; margin-bottom: 4px;">
								${dateStr}
							</div>
							${linesHtml}
						</div>
					`;
				},
			},
		}),
		[
			colorMode,
			gridColor,
			mutedTextColor,
			intervalSeconds,
			isNetwork,
			isRTL,
			computedMin,
			computedMax,
			actualMinTs,
			actualMaxTs,
		],
	);

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside" isCentered>
			<ModalOverlay bg="blackAlpha.700" backdropFilter="blur(16px)" />
			<ModalContent
				bg="panel.surface"
				borderWidth="1px"
				borderColor="panel.border"
				borderRadius="20px"
				boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.08), 0 32px 80px rgba(0,0,0,0.6)"
				mx={{ base: 3, sm: 6 }}
				overflow="hidden"
			>
				<ModalHeader
					display="flex"
					alignItems="center"
					justifyContent="space-between"
					px={{ base: 4, md: 6 }}
					py={{ base: 3.5, md: 4 }}
					borderBottomWidth="1px"
					borderColor="panel.border"
					fontSize="sm"
					fontWeight="700"
				>
					<Text color="panel.text">{t("dashboard.history.modalTitle", { metric: payload?.title ?? "" })}</Text>
					<ModalCloseButton position="static" size="sm" />
				</ModalHeader>
				<ModalBody px={{ base: 4, md: 6 }} py={{ base: 4, md: 5 }}>
					<Stack spacing={4}>
						{hasEnoughPoints && (
							<Box
								p={1}
								borderRadius="full"
								bg="panel.elevated"
								w={{ base: "full", md: "fit-content" }}
								maxW="100%"
								overflowX="auto"
								position="relative"
								display="inline-flex"
								alignItems="center"
								sx={{
									"&::-webkit-scrollbar": {
										display: "none",
									},
									scrollbarWidth: "none",
								}}
							>
								{pillStyle.width > 0 && (
									<motion.div
										animate={{
											left: pillStyle.left,
											width: pillStyle.width,
										}}
										transition={{
											type: "tween",
											ease: [0.16, 1, 0.3, 1],
											duration: 0.32,
										}}
										style={{
											position: "absolute",
											top: 4,
											bottom: 4,
											borderRadius: "9999px",
											backgroundColor: "var(--chakra-colors-panel-surface)",
											boxShadow: "0 1px 3px rgba(0, 0, 0, 0.15)",
											zIndex: 1,
											pointerEvents: "none",
										}}
									/>
								)}
								{HISTORY_INTERVALS.map((interval, idx) => {
									const isAvailable = idx === 0 || availableSpan >= interval.seconds * 0.5;
									const isActive = intervalSeconds === interval.seconds;
									return (
										<Box
											key={interval.seconds}
											ref={(el: HTMLDivElement | null) => {
												tabRefs.current[idx] = el;
											}}
											flex={{ base: "1 1 0", md: "none" }}
											position="relative"
											display="inline-flex"
											alignItems="center"
											justifyContent="center"
										>
											<Button
												size="xs"
												h="26px"
												w="full"
												px={{ base: 1, sm: 3.5 }}
												borderRadius="full"
												variant="ghost"
												bg="transparent !important"
												color={isActive ? "panel.text" : "panel.textMuted"}
												fontWeight={isActive ? "700" : "500"}
												fontSize={{ base: "10px", sm: "11px" }}
												whiteSpace="nowrap"
												position="relative"
												zIndex={2}
												opacity={isAvailable ? 1 : 0.4}
												cursor={isAvailable ? "pointer" : "not-allowed"}
												_hover={{
													md: {
														color: "panel.text",
													},
												}}
												_focusVisible={{
													outline: "2px solid var(--rb-panel-accent)",
													outlineOffset: "2px",
												}}
												onClick={() => {
													if (isAvailable && intervalSeconds !== interval.seconds) {
														setIsSwitchingInterval(true);
														onIntervalChange(interval.seconds);
														setTimeout(() => setIsSwitchingInterval(false), 300);
													}
												}}
											>
												{t(interval.labelKey)}
											</Button>
										</Box>
									);
								})}
							</Box>
						)}
						<Box
							minH="300px"
							w="100%"
							position="relative"
							dir="ltr"
							pb={2}
							sx={{
								"& .apexcharts-canvas": {
									direction: "ltr !important",
								},
								"& .apexcharts-yaxis-label": {
									direction: "ltr !important",
								},
								"& .apexcharts-legend": {
									direction: "ltr !important",
									display: "flex !important",
									justifyContent: "center !important",
									gap: "18px !important",
								},
								"& .apexcharts-legend-series": {
									display: "inline-flex !important",
									alignItems: "center !important",
									flexDirection: isRTL ? "row !important" : "row !important",
									gap: "6px !important",
									margin: "0 !important",
								},
								"& .apexcharts-legend-marker": {
									order: isRTL ? 2 : 1,
									margin: "0 !important",
									position: "relative !important",
									top: "auto !important",
									left: "auto !important",
									right: "auto !important",
									bottom: "auto !important",
									transform: "none !important",
								},
								"& .apexcharts-legend-text": {
									order: isRTL ? 1 : 2,
									margin: "0 !important",
									padding: "0 !important",
									position: "relative !important",
									top: "auto !important",
									left: "auto !important",
									right: "auto !important",
									bottom: "auto !important",
								},
								"& .apexcharts-tooltip": {
									background: "transparent !important",
									border: "none !important",
									boxShadow: "none !important",
									overflow: "visible !important",
								},
								"& .apexcharts-tooltip.apexcharts-theme-light": {
									background: "transparent !important",
									border: "none !important",
									boxShadow: "none !important",
								},
								"& .apexcharts-tooltip.apexcharts-theme-dark": {
									background: "transparent !important",
									border: "none !important",
									boxShadow: "none !important",
								},
								"& .apexcharts-legend-series.apexcharts-inactive-legend": {
									opacity: "0.45 !important",
									pointerEvents: "auto",
								},
								"& .apexcharts-legend-series.apexcharts-inactive-legend:hover": {
									opacity: "0.75 !important",
								},
								"& .apexcharts-canvas:has(.apexcharts-inactive-legend:hover) .apexcharts-series": {
									opacity: "1 !important",
								},
							}}
						>
							<AnimatePresence>
								{isSwitchingInterval && (
									<motion.div
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={{ duration: 0.15, ease: "easeInOut" }}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											right: 0,
											bottom: 0,
											backgroundColor: "rgba(10, 12, 16, 0.7)",
											backdropFilter: "blur(6px)",
											borderRadius: "16px",
											zIndex: 10,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Spinner size="md" color="panel.accent" thickness="2.5px" />
									</motion.div>
								)}
							</AnimatePresence>
							<motion.div
								animate={{ opacity: isSwitchingInterval ? 0 : 1 }}
								transition={{ duration: 0.25, ease: "easeInOut" }}
								style={{ width: "100%", height: "100%" }}
							>
								<Suspense
									fallback={
										<Flex h="280px" align="center" justify="center">
											<Spinner size="md" color="panel.accent" />
										</Flex>
									}
								>
									{hasEnoughPoints && isOpen ? (
										<HistoryChart
											key={`${payload?.title}-${intervalSeconds}-${colorMode}`}
											options={options}
											series={chartSeries}
											type="area"
											height={300}
											width="100%"
										/>
									) : (
										<Flex h="300px" align="center" justify="center" direction="column" gap={2}>
											<Text fontSize="13px" color="panel.textMuted">
												{t("noData")}
											</Text>
										</Flex>
									)}
								</Suspense>
							</motion.div>
						</Box>
					</Stack>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
};

const average = (values: number[]) =>
	values.length
		? values.reduce((total, value) => total + value, 0) / values.length
		: 0;
const peak = (values: number[]) => (values.length ? Math.max(...values) : 0);

const DonutGauge: FC<{
	total: number;
	active: number;
	label?: string;
	size?: number;
}> = ({ total, active, label = "TOTAL", size = 110 }) => {
	const strokeWidth = 9;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const percent = total > 0 ? Math.min(100, Math.max(0, (active / total) * 100)) : 0;
	const strokeDashoffset = circumference - (percent / 100) * circumference;

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
				w={`${size * 0.65}px`}
				h={`${size * 0.65}px`}
				borderRadius="full"
				bg="var(--rb-panel-accent-soft)"
				filter="blur(14px)"
				opacity={0.65}
				pointerEvents="none"
			/>
			<svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
				<defs>
					<linearGradient id="donutGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stopColor="var(--rb-panel-accent)" />
						<stop offset="100%" stopColor="var(--rb-panel-accent-hover)" />
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
					stroke="url(#donutGaugeGrad)"
					strokeWidth={strokeWidth}
					fill="none"
					strokeDasharray={circumference}
					strokeDashoffset={strokeDashoffset}
					strokeLinecap="round"
					style={{
						transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)",
						filter:
							"drop-shadow(0 0 10px var(--rb-panel-accent-glow)) drop-shadow(0 0 4px var(--rb-panel-accent))",
					}}
				/>
			</svg>
			<VStack spacing={0} position="absolute" inset={0} justify="center" align="center" pointerEvents="none">
				<Text
					fontSize={{ base: "20px", sm: "22px" }}
					fontWeight="800"
					color="panel.text"
					lineHeight="1.1"
					dir="ltr"
					sx={{ fontVariantNumeric: "tabular-nums" }}
				>
					{total}
				</Text>
				<Text
					fontSize="9px"
					fontWeight="700"
					letterSpacing="0.08em"
					color="panel.textMuted"
					textTransform="uppercase"
				>
					{label}
				</Text>
			</VStack>
		</Box>
	);
};

const RadialProgressRing: FC<{
	percent: number;
	size?: number;
	strokeWidth?: number;
	id: string;
	criticalColor?: string;
}> = ({
	percent,
	size = 54,
	strokeWidth = 5,
	id,
	criticalColor,
}) => {
	const safe = clampPercent(percent);
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const strokeDashoffset = circumference - (safe / 100) * circumference;

	const isCritical = safe >= 90;
	const isWarning = safe >= 75 && !isCritical;

	const gradStart = criticalColor || (isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "var(--rb-panel-accent)");
	const gradEnd = isCritical ? "#f87171" : isWarning ? "#fbbf24" : "var(--rb-panel-accent-hover)";
	const glowColor = isCritical
		? "rgba(239, 68, 68, 0.45)"
		: isWarning
			? "rgba(245, 158, 11, 0.45)"
			: "var(--rb-panel-accent-glow)";

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
					<linearGradient id={`radialGrad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
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
					stroke={`url(#radialGrad-${id})`}
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
					fontSize={{ base: "11px", sm: "11.5px" }}
					fontWeight="800"
					color="panel.text"
					dir="ltr"
					sx={{ fontVariantNumeric: "tabular-nums" }}
					lineHeight="1"
				>
					{Math.round(safe)}%
				</Text>
			</Flex>
		</Box>
	);
};

const ResourceCard: FC<{
	label: string;
	icon: ReactNode;
	value: string;
	totalValue?: string;
	percent: number;
	badgeText?: string;
	metaUnit?: string;
	metaValue?: string | number;
	subMeta?: ReactNode;
	footerLeft?: string;
	footerRight?: string;
	onHistory?: () => void;
	historyLabel?: string;
	isRTL?: boolean;
}> = ({
	label,
	icon,
	value,
	totalValue,
	percent,
	badgeText,
	metaUnit,
	metaValue,
	subMeta,
	footerLeft,
	footerRight,
	onHistory,
	historyLabel,
	isRTL = false,
}) => {
	const rawId = useId();
	const ringId = useMemo(() => rawId.replace(/[^a-zA-Z0-9]/g, ""), [rawId]);
	const safe = clampPercent(percent);
	const accent = "var(--rb-panel-accent)";
	const criticalColor = safe >= 90 ? "#ef4444" : safe >= 75 ? "#f59e0b" : accent;

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
						<Text fontSize={{ base: "11px", sm: "12px", md: "13px" }} fontWeight="600" color="panel.textSecondary" noOfLines={1}>
							{label}
						</Text>
					</HStack>
					{onHistory && (
						<Button
							size="xs"
							h={{ base: "20px", sm: "22px" }}
							minW={{ base: "20px", sm: "auto" }}
							px={{ base: 1.5, sm: 2 }}
							fontSize="11px"
							variant="ghost"
							borderRadius="full"
							bg="var(--rb-panel-accent-soft)"
							borderWidth="1px"
							borderColor="var(--rb-panel-accent-glow)"
							color="var(--rb-panel-accent)"
							boxShadow="0 0 8px -2px var(--rb-panel-accent-glow)"
							fontWeight="600"
							transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
							_hover={{
								bg: "var(--rb-panel-accent-glow)",
								color: "panel.text",
								transform: "scale(1.05)",
								boxShadow: "0 0 14px var(--rb-panel-accent-glow)",
							}}
							_active={{
								transform: "scale(0.96)",
							}}
							_focusVisible={{
								outline: "2px solid var(--rb-panel-accent)",
								outlineOffset: "2px",
							}}
							onClick={onHistory}
							title={historyLabel}
						>
							<Box as={ClockIcon} w="12px" h="12px" display={{ base: "block", sm: "none" }} />
							<Text as="span" display={{ base: "none", sm: "inline" }}>{historyLabel}</Text>
						</Button>
					)}
				</Flex>

				<Flex align="center" justify="space-between" gap={2} my={{ base: 1, sm: 1.5 }}>
					<Box minW={0} flex="1">
						<Flex align="baseline" gap={1.5} flexWrap="wrap">
							<Text
								fontSize={{ base: "17px", sm: "19px", md: "22px" }}
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
								w="5px"
								h="5px"
								borderRadius="full"
								bg={criticalColor}
								boxShadow={`0 0 8px ${criticalColor}`}
								alignSelf="center"
								sx={{
									animation: "pulseBeacon 2.6s ease-in-out infinite",
									"@keyframes pulseBeacon": {
										"0%, 100%": { opacity: 0.5, transform: "scale(0.9)" },
										"50%": { opacity: 1, transform: "scale(1.3)", boxShadow: `0 0 12px ${criticalColor}` },
									},
								}}
							/>
							{totalValue && (
								<Text
									fontSize={{ base: "10.5px", sm: "11px", md: "12px" }}
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

						{badgeText && (
							<Flex align="center" mt={1}>
								<Flex
									align="center"
									gap={1}
									px={1.5}
									py={0.4}
									borderRadius="full"
									bg="var(--rb-panel-accent-soft)"
									borderWidth="1px"
									borderColor="var(--rb-panel-accent-glow)"
									color="var(--rb-panel-accent)"
									boxShadow="0 0 8px -2px var(--rb-panel-accent-glow)"
									fontSize={{ base: "9.5px", sm: "10px", md: "10.5px" }}
									fontWeight="700"
									flexShrink={0}
									sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
								>
									<Box
										w="4px"
										h="4px"
										borderRadius="full"
										bg="var(--rb-panel-accent)"
										boxShadow="0 0 6px var(--rb-panel-accent)"
									/>
									<Text as="span">{badgeText}</Text>
								</Flex>
							</Flex>
						)}

						{subMeta && (
							<Box mt={1} fontSize={{ base: "9.5px", sm: "10px" }}>
								{subMeta}
							</Box>
						)}
					</Box>

					<RadialProgressRing
						percent={safe}
						id={ringId}
						size={56}
						criticalColor={safe >= 75 ? criticalColor : undefined}
					/>
				</Flex>
			</Box>

			<Box mt={{ base: 2, sm: 2.5 }} pt={1.5} borderTop="1px solid" borderColor="rgba(255, 255, 255, 0.05)">
				{(footerLeft || footerRight) && (
					<Flex
						justify="space-between"
						align={{ base: "flex-start", sm: "center" }}
						direction={{ base: "column", xs: "row", sm: "row" }}
						gap={{ base: 0.5, sm: 2 }}
						fontSize={{ base: "9.5px", sm: "10.5px", md: "11px" }}
						fontWeight="500"
						color="panel.textMuted"
						dir={isRTL ? "rtl" : "ltr"}
						sx={{ unicodeBidi: "isolate", fontVariantNumeric: "tabular-nums" }}
					>
						{footerLeft && <Text noOfLines={1}>{footerLeft}</Text>}
						{footerRight && <Text noOfLines={1}>{footerRight}</Text>}
					</Flex>
				)}
			</Box>
		</Box>
	);
};

const StatRow: FC<{
	label: string;
	value: string | number;
	dimLabel?: boolean;
	accent?: boolean;
	tag?: string;
	tagColor?: string;
	helper?: string;
}> = ({ label, value, dimLabel, accent, tag, tagColor, helper }) => {
	const accentColor = "var(--rb-panel-accent)";
	return (
		<Flex
			align="center"
			justify="space-between"
			py={2.5}
			borderBottomWidth="1px"
			borderColor="panel.border"
			_last={{ borderBottomWidth: 0 }}
			gap={3}
		>
			<HStack spacing={3} minW={0} flexWrap="nowrap">
				{tagColor && (
					<Box
						flexShrink={0}
						w="7px"
						h="7px"
						borderRadius="full"
						bg={tagColor}
						me="3px"
						boxShadow={`0 0 6px ${tagColor}88`}
					/>
				)}
				<Text
					fontSize="13px"
					fontWeight="600"
					color={dimLabel ? "panel.textMuted" : "panel.textSecondary"}
					noOfLines={1}
				>
					{label}
				</Text>
				{tag && (
					<Flex
						as="span"
						align="center"
						justify="center"
						fontSize="10px"
						px={1.5}
						py={0.5}
						borderRadius="md"
						bg="panel.elevated"
						color="panel.textMuted"
						fontWeight="600"
						dir="ltr"
						transition="all 0.25s ease"
						_groupHover={{
							md: {
								bg: "panel.surface",
								color: "panel.textSecondary",
							},
						}}
					>
						<Text as="span" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
							{tag.endsWith("%") ? `${tag.slice(0, -1)}%` : tag}
						</Text>
					</Flex>
				)}
			</HStack>
			<VStack align="flex-end" spacing={0} flexShrink={0}>
				<Text
					fontSize="13px"
					fontWeight="700"
					color={accent ? accentColor : "panel.text"}
					dir="ltr"
					sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
				>
					{typeof value === "number" ? formatNumberValue(value) : value}
				</Text>
				{helper && (
					<Text
						fontSize="10px"
						color="panel.textMuted"
						dir="ltr"
						sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
					>
						{helper}
					</Text>
				)}
			</VStack>
		</Flex>
	);
};

const SectionCard: FC<{
	children: ReactNode;
	title?: ReactNode;
	action?: ReactNode;
	noHover?: boolean;
	roleGroup?: boolean;
}> = ({
	children,
	title,
	action,
	noHover = false,
	roleGroup = true,
}) => (
	<Box
		role={roleGroup ? "group" : undefined}
		bg="panel.surface"
		background="linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.003) 100%), var(--chakra-colors-panel-surface)"
		backdropFilter="blur(16px)"
		borderWidth="1px"
		borderColor="panel.border"
		borderRadius={{ base: "14px", sm: "16px", md: "20px" }}
		position="relative"
		overflow="hidden"
		boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.14)"
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
		_hover={
			noHover
				? undefined
				: {
						md: {
							transform: "translateY(-3px)",
							borderColor: "var(--rb-panel-accent-glow)",
							bg: "panel.elevated",
							boxShadow:
								"0 14px 32px -6px rgba(0, 0, 0, 0.38), 0 0 22px -5px var(--rb-panel-accent-glow), inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)",
						},
					}
		}
	>
		{(title || action) && (
			<Flex
				px={{ base: 3, sm: 4, md: 6 }}
				py={{ base: 2.5, sm: 3, md: 3.5 }}
				align="center"
				justify="space-between"
				borderBottomWidth="1px"
				borderColor="panel.border"
			>
				{title && (
					<Text fontSize={{ base: "12px", sm: "13px" }} fontWeight="700" color="panel.text" letterSpacing="-0.01em">
						{title}
					</Text>
				)}
				{action}
			</Flex>
		)}
		<Box px={{ base: 3, sm: 4, md: 6 }} py={{ base: 3, sm: 3.5, md: 4 }}>
			{children}
		</Box>
	</Box>
);

const AnimatedHeightWrapper: FC<{
	children: ReactNode;
	activeKey: string;
}> = ({ children, activeKey }) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | "auto">("auto");

	useEffect(() => {
		if (containerRef.current) {
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const newHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
					if (newHeight > 0) {
						setHeight(newHeight);
					}
				}
			});

			resizeObserver.observe(containerRef.current);
			return () => resizeObserver.disconnect();
		}
	}, []);

	return (
		<motion.div
			animate={{ height }}
			transition={{
				duration: 0.7,
				ease: [0.22, 1, 0.36, 1],
			}}
			style={{ overflow: "hidden" }}
		>
			<div ref={containerRef}>
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={activeKey}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{
							opacity: { duration: 0.12, ease: "linear" },
						}}
					>
						{children}
					</motion.div>
				</AnimatePresence>
			</div>
		</motion.div>
	);
};

const SpeedItem: FC<{
	icon: ReactNode;
	label: string;
	value: string;
	direction?: "in" | "out";
}> = ({ icon, label, value, direction = "in" }) => {
	const isIncoming = direction === "in";
	const pulseColor = isIncoming ? "#10b981" : "#38bdf8";

	return (
		<Flex
			align="center"
			justify="space-between"
			gap={3}
			p={{ base: 1.5, sm: 2 }}
			borderRadius="12px"
			borderWidth="1px"
			borderColor="transparent"
			transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
			_hover={{
				bg: "var(--rb-panel-accent-subtle)",
				borderColor: "var(--rb-panel-accent-soft)",
				transform: "translateX(3px)",
			}}
		>
			<HStack spacing={2.5} color="panel.textMuted">
				<Flex
					w="30px"
					h="30px"
					align="center"
					justify="center"
					borderRadius="9px"
					bg={isIncoming ? "rgba(16, 185, 129, 0.12)" : "rgba(56, 189, 248, 0.12)"}
					color={isIncoming ? "#10b981" : "#38bdf8"}
					borderWidth="1px"
					borderColor={isIncoming ? "rgba(16, 185, 129, 0.25)" : "rgba(56, 189, 248, 0.25)"}
					boxShadow={isIncoming ? "0 0 10px rgba(16, 185, 129, 0.2)" : "0 0 10px rgba(56, 189, 248, 0.2)"}
					flexShrink={0}
					transition="all 0.25s ease"
					_groupHover={{
						transform: "scale(1.08)",
						boxShadow: isIncoming ? "0 0 16px rgba(16, 185, 129, 0.4)" : "0 0 16px rgba(56, 189, 248, 0.4)",
					}}
				>
					{icon}
				</Flex>
				<HStack spacing={2}>
					<Text fontSize="13px" fontWeight="600" color="panel.textSecondary">
						{label}
					</Text>
					<Box
						w="6px"
						h="6px"
						borderRadius="full"
						bg={pulseColor}
						boxShadow={`0 0 8px ${pulseColor}`}
						sx={{
							animation: "speedPulse 2s ease-in-out infinite",
							"@keyframes speedPulse": {
								"0%, 100%": { opacity: 0.4, transform: "scale(0.85)" },
								"50%": { opacity: 1, transform: "scale(1.2)", boxShadow: `0 0 10px ${pulseColor}` },
							},
						}}
					/>
				</HStack>
			</HStack>
			<Text
				fontSize="13px"
				fontWeight="700"
				letterSpacing="-0.01em"
				color="panel.text"
				dir="ltr"
				sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
			>
				{value}
			</Text>
		</Flex>
	);
};

export const Statistics: FC<BoxProps> = (props) => {
	const { version } = useDashboard();
	const { userData } = useGetUser();
	const { t, i18n } = useTranslation();
	const isRTL = i18n.dir(i18n.language) === "rtl";

	const { data: rawSystemData } = useQuery<SystemStats>({
		queryKey: StatisticsQueryKey,
		queryFn: () => fetch("/system"),
		onSuccess: (stats) => {
			const currentVersion = stats?.version;
			if (currentVersion && version !== currentVersion) {
				useDashboard.setState({ version: currentVersion });
			}
		},
	});

	const { data: maintenanceInfo } = useQuery<MaintenanceInfo>(
		["dashboard-maintenance-info"],
		() => fetch<MaintenanceInfo>("/maintenance/info", { timeout: 8000 }),
		{
			refetchOnWindowFocus: false,
			staleTime: 5 * 60 * 1000,
			retry: false,
		},
	);

	const { data: myUsersData } = useQuery<UsersListResponse>(
		["dashboard-my-users-stats", userData.username],
		() =>
			fetch<UsersListResponse>("/users", {
				query: { admin: userData.username, limit: 1000 },
			}),
		{
			enabled: Boolean(userData.username),
			staleTime: 10_000,
			refetchInterval: 15_000,
		},
	);

	const systemData = useMemo(() => sanitizeSystemStats(rawSystemData), [rawSystemData]);
	useSystemMetricsStream(true);

	useEffect(() => {
		if (systemData?.version && version !== systemData.version) {
			useDashboard.setState({ version: systemData.version });
		}
	}, [systemData?.version, version]);

	const [historyPayload, setHistoryPayload] = useState<HistoryModalPayload | null>(null);
	const [historyInterval, setHistoryInterval] = useState(HISTORY_INTERVALS[0].seconds);
	const [userTab, setUserTab] = useState<"all" | "mine">("all");
	const { colorMode } = useColorMode();

	const canSeeGlobal = userData.role === AdminRole.Sudo || userData.role === AdminRole.FullAccess;
	const diagnosticsQuery = useSystemDiagnostics(canSeeGlobal);
	const criticalIssues = dashboardDiagnostics(diagnosticsQuery.data || [], diagnosticsQuery.isSuccess ? undefined : systemData || undefined);
	const hasXrayError = criticalIssues.some((issue) =>
		issue.resource_type === "node" || issue.resource_type === "node_service" && issue.resource === "xray",
	);

	const openHistory = (payload: HistoryModalPayload) => {
		setHistoryInterval(HISTORY_INTERVALS[0].seconds);
		setHistoryPayload(payload);
	};

	if (!systemData) {
		return (
			<Stack
				spacing={{ base: 4, md: 5 }}
				w="full"
				dir={isRTL ? "rtl" : "ltr"}
				sx={{
					"@keyframes shimmer": {
						"0%": { opacity: 0.35 },
						"50%": { opacity: 0.75 },
						"100%": { opacity: 0.35 },
					},
					"& .shimmer-box": {
						animation: "shimmer 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
					},
				}}
			>
				{canSeeGlobal && <SystemDiagnostics issues={criticalIssues} criticalOnly />}
				<Flex
					align="center"
					justify="space-between"
					px={1}
					flexWrap="wrap"
					gap={3}
					sx={{
						"@media screen and (max-width: 767px)": {
							"& > div:last-child": {
								width: "100%",
								justifyContent: "flex-start",
							},
						},
					}}
				>
					<Flex
						wrap="wrap"
						gap={{ base: 2.5, md: 1 }}
						sx={{
							flexDirection: "column",
							alignItems: "flex-start",
							"@media screen and (max-width: 767px)": {
								flexDirection: "row",
								alignItems: "center",
							},
							"@media screen and (min-width: 768px) and (max-width: 991px)": {
								"body:has([data-sidebar-collapsed='true']) &": {
									flexDirection: "row",
									alignItems: "center",
								},
								"body:not(:has([data-sidebar-collapsed='true'])) &": {
									flexDirection: "column",
									alignItems: "flex-start",
								},
							},
							"@media screen and (min-width: 992px)": {
								flexDirection: "column",
								alignItems: "flex-start",
							},
						}}
					>
						<Box className="shimmer-box" w={{ base: "140px", sm: "170px" }} h="24px" bg="panel.surface" borderRadius="8px" borderWidth="1px" borderColor="panel.border" />
						<HStack spacing={1.5}>
							<Box className="shimmer-box" w="65px" h="18px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
							<Box className="shimmer-box" w="85px" h="18px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
							<Box className="shimmer-box" w="75px" h="18px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
						</HStack>
					</Flex>
					<Box w={{ base: "full", sm: "auto" }} flexShrink={0}>
						<HStack display={{ base: "none", sm: "flex" }} spacing={2} align="center" justify="flex-end">
							<Box className="shimmer-box" w="118px" h="32px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
							<Box className="shimmer-box" w="100px" h="32px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
							<Box className="shimmer-box" w="114px" h="32px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
						</HStack>
						<Stack display={{ base: "flex", sm: "none" }} spacing={2} w="full">
							<Box className="shimmer-box" w="full" h="32px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
							<Flex gap={2} w="full" align="center">
								<Box className="shimmer-box" flex="1 1 50%" h="32px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
								<Box className="shimmer-box" flex="1 1 50%" h="32px" bg="panel.surface" borderRadius="full" borderWidth="1px" borderColor="panel.border" />
							</Flex>
						</Stack>
					</Box>
				</Flex>

				<SimpleGrid
					columns={{ base: 2, md: 4 }}
					gap={{ base: 2.5, sm: 3, md: 4 }}
					sx={{
						"@media screen and (min-width: 768px) and (max-width: 910px)": {
							"body:not(:has([data-sidebar-collapsed='true'])) &": {
								gridTemplateColumns: "1fr !important",
							},
						},
					}}
				>
					{[1, 2, 3, 4].map((i) => (
						<Box
							key={i}
							className="shimmer-box"
							bg="panel.surface"
							borderRadius={{ base: "14px", sm: "16px", md: "20px" }}
							borderWidth="1px"
							borderColor="panel.border"
							p={{ base: 2.5, sm: 3.5, md: 5 }}
							display="flex"
							flexDirection="column"
							justifyContent="space-between"
							boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.12)"
						>
							<Box>
								<Flex justify="space-between" align="center" mb={{ base: 1.5, sm: 2.5, md: 3 }}>
									<HStack spacing={{ base: 1.5, sm: 2.5 }} align="center">
										<Box w={{ base: "26px", sm: "28px", md: "32px" }} h={{ base: "26px", sm: "28px", md: "32px" }} borderRadius={{ base: "7px", sm: "8px", md: "9px" }} bg="panel.elevated" flexShrink={0} />
										<Box w={{ base: "50px", sm: "75px", md: "90px" }} h="14px" borderRadius="md" bg="panel.elevated" />
									</HStack>
									{i <= 2 && <Box w={{ base: "20px", sm: "40px", md: "60px" }} h="20px" borderRadius="full" bg="panel.elevated" />}
								</Flex>
								<Flex align="baseline" gap={1.5} mb={1}>
									<Box w={{ base: "45px", sm: "55px", md: "65px" }} h={{ base: "18px", sm: "22px", md: "24px" }} borderRadius="md" bg="panel.elevated" />
									<Box w={i === 1 ? "30px" : "45px"} h="14px" borderRadius="md" bg="panel.elevated" />
								</Flex>
								{i === 1 && (
									<Box mt={0.5}>
										<Box w="100px" h="11px" borderRadius="md" bg="panel.elevated" />
									</Box>
								)}
							</Box>
							<Box mt={{ base: 1.5, sm: 2.5, md: 3 }}>
								<Box w="full" h={{ base: "3.5px", sm: "4px" }} borderRadius="full" bg="panel.elevated" />
								<Flex justify="space-between" align="center" mt={{ base: 1.5, sm: 2 }} pt={{ base: 1, sm: 2 }} borderTopWidth="1px" borderColor="panel.border">
									<Box w={{ base: "40px", sm: "65px", md: "80px" }} h="11px" borderRadius="sm" bg="panel.elevated" />
									<Box w={{ base: "40px", sm: "60px", md: "70px" }} h="11px" borderRadius="sm" bg="panel.elevated" />
								</Flex>
							</Box>
						</Box>
					))}
				</SimpleGrid>

				<SimpleGrid
					columns={{ base: 1, md: 2 }}
					gap={{ base: 3, md: 4 }}
					sx={{
						"@media screen and (min-width: 768px) and (max-width: 910px)": {
							"body:not(:has([data-sidebar-collapsed='true'])) &": {
								gridTemplateColumns: "1fr !important",
							},
						},
					}}
				>
					<Box
						className="shimmer-box"
						bg="panel.surface"
						borderRadius="20px"
						borderWidth="1px"
						borderColor="panel.border"
						overflow="hidden"
						boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.12)"
					>
						<Flex px={{ base: 4, sm: 5, md: 6 }} py={3.5} justify="space-between" align="center" borderBottomWidth="1px" borderColor="panel.border">
							<HStack spacing={2.5}>
								<Box w="26px" h="26px" borderRadius="7px" bg="panel.elevated" />
								<Box w="110px" h="16px" borderRadius="md" bg="panel.elevated" />
							</HStack>
							<Box w="75px" h="22px" borderRadius="full" bg="panel.elevated" />
						</Flex>
						<Box p={{ base: 4, sm: 5, md: 6 }}>
							<Stack spacing={3}>
								<Flex justify="space-between" align="center" gap={3}>
									<HStack spacing={2.5}>
										<Box w="28px" h="28px" borderRadius="8px" bg="panel.elevated" flexShrink={0} />
										<Box w="85px" h="15px" borderRadius="md" bg="panel.elevated" />
									</HStack>
									<Box w="80px" h="16px" borderRadius="md" bg="panel.elevated" />
								</Flex>
								<Flex justify="space-between" align="center" gap={3}>
									<HStack spacing={2.5}>
										<Box w="28px" h="28px" borderRadius="8px" bg="panel.elevated" flexShrink={0} />
										<Box w="90px" h="15px" borderRadius="md" bg="panel.elevated" />
									</HStack>
									<Box w="80px" h="16px" borderRadius="md" bg="panel.elevated" />
								</Flex>
							</Stack>
						</Box>
					</Box>

					<Box
						className="shimmer-box"
						bg="panel.surface"
						borderRadius="20px"
						borderWidth="1px"
						borderColor="panel.border"
						overflow="hidden"
						boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.12)"
					>
						<Flex px={{ base: 4, sm: 5, md: 6 }} py={3.5} justify="space-between" align="center" borderBottomWidth="1px" borderColor="panel.border">
							<HStack spacing={2.5}>
								<Box w="26px" h="26px" borderRadius="7px" bg="panel.elevated" />
								<Box w="90px" h="16px" borderRadius="md" bg="panel.elevated" />
							</HStack>
						</Flex>
						<Box p={{ base: 4, sm: 5, md: 6 }}>
							<Stack spacing={3}>
								<Flex justify="space-between" align="center" gap={3}>
									<HStack spacing={2.5}>
										<Box w="28px" h="28px" borderRadius="8px" bg="panel.elevated" flexShrink={0} />
										<Box w="95px" h="15px" borderRadius="md" bg="panel.elevated" />
									</HStack>
									<Box w="110px" h="16px" borderRadius="md" bg="panel.elevated" />
								</Flex>
								<Flex justify="space-between" align="center" gap={3}>
									<HStack spacing={2.5}>
										<Box w="28px" h="28px" borderRadius="8px" bg="panel.elevated" flexShrink={0} />
										<Box w="90px" h="15px" borderRadius="md" bg="panel.elevated" />
									</HStack>
									<Box w="95px" h="16px" borderRadius="md" bg="panel.elevated" />
								</Flex>
							</Stack>
						</Box>
					</Box>
				</SimpleGrid>

				<Box
					className="shimmer-box"
					bg="panel.surface"
					borderRadius="20px"
					borderWidth="1px"
					borderColor="panel.border"
					overflow="hidden"
					boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.12)"
				>
					<Flex px={{ base: 4, sm: 5, md: 6 }} py={3.5} justify="space-between" align="center" borderBottomWidth="1px" borderColor="panel.border">
						<HStack spacing={2.5}>
							<Box w="26px" h="26px" borderRadius="7px" bg="panel.elevated" />
							<Box w="110px" h="16px" borderRadius="md" bg="panel.elevated" />
						</HStack>
						<Box w="75px" h="22px" borderRadius="full" bg="panel.elevated" />
					</Flex>
					<Box p={{ base: 4, sm: 5, md: 6 }}>
						<SimpleGrid columns={{ base: 1, sm: 2 }} gap={{ base: 3, md: 4 }}>
							{[1, 2].map((i) => (
								<Box
									key={i}
									bg="panel.surface"
									borderRadius="20px"
									borderWidth="1px"
									borderColor="panel.border"
									p={{ base: 4, sm: 5 }}
									display="flex"
									flexDirection="column"
									justifyContent="space-between"
									boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.12)"
								>
									<Box>
										<Flex justify="space-between" align="center" mb={3}>
											<HStack spacing={2.5} align="center">
												<Box w="32px" h="32px" borderRadius="9px" bg="panel.elevated" flexShrink={0} />
												<Box w={i === 1 ? "120px" : "130px"} h="16px" borderRadius="md" bg="panel.elevated" />
											</HStack>
										</Flex>
										<Flex align="baseline" gap={1.5} mb={1}>
											<Box w="55px" h="24px" borderRadius="md" bg="panel.elevated" />
											<Box w="45px" h="16px" borderRadius="md" bg="panel.elevated" />
										</Flex>
									</Box>
									<Box mt={3}>
										<Flex justify="space-between" align="center" mb={1.5}>
											<Box w="32px" h="13px" borderRadius="sm" bg="panel.elevated" />
										</Flex>
										<Box w="full" h="4px" borderRadius="full" bg="panel.elevated" />
										<Flex justify="space-between" align="center" mt={2.5} pt={2.5} borderTopWidth="1px" borderColor="panel.border">
											<Box w="75px" h="14px" borderRadius="sm" bg="panel.elevated" />
											<Box w="70px" h="14px" borderRadius="sm" bg="panel.elevated" />
										</Flex>
									</Box>
								</Box>
							))}
						</SimpleGrid>
					</Box>
				</Box>

				<Box
					className="shimmer-box"
					bg="panel.surface"
					borderRadius="20px"
					borderWidth="1px"
					borderColor="panel.border"
					overflow="hidden"
					boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.12)"
				>
					<Flex px={{ base: 4, sm: 5, md: 6 }} py={3.5} justify="space-between" align="center" borderBottomWidth="1px" borderColor="panel.border">
						<HStack spacing={2.5}>
							<Box w="26px" h="26px" borderRadius="7px" bg="panel.elevated" />
							<Box w="90px" h="16px" borderRadius="md" bg="panel.elevated" />
						</HStack>
						<HStack spacing={0.5} bg="panel.elevated" p={0.5} borderRadius="8px">
							<Box w="65px" h="22px" borderRadius="6px" bg="panel.surface" />
							<Box w="60px" h="22px" borderRadius="6px" bg="transparent" />
						</HStack>
					</Flex>
					<Box p={{ base: 4, sm: 5, md: 6 }}>
						<Stack spacing={0}>
							{[
								{ id: "skel-u-total", hasTag: false, hasHelper: false, labelW: "55px", valW: "35px" },
								{ id: "skel-u-active", hasTag: true, hasHelper: false, labelW: "55px", valW: "35px" },
								{ id: "skel-u-online", hasTag: true, hasHelper: true, labelW: "55px", valW: "35px" },
								{ id: "skel-u-onhold", hasTag: false, hasHelper: false, labelW: "65px", valW: "30px" },
								{ id: "skel-u-limited", hasTag: false, hasHelper: false, labelW: "70px", valW: "30px" },
								{ id: "skel-u-expired", hasTag: false, hasHelper: false, labelW: "75px", valW: "30px" },
							].map((row, idx) => (
								<Flex
									key={row.id}
									justify="space-between"
									align="center"
									py={2.5}
									borderBottomWidth={idx === 5 ? "0" : "1px"}
									borderColor="panel.border"
								>
									<HStack spacing={3} minW={0}>
										<Box w="7px" h="7px" borderRadius="full" bg="panel.elevated" me="3px" flexShrink={0} />
										<Box w={row.labelW} h="14px" borderRadius="md" bg="panel.elevated" />
										{row.hasTag && <Box w="36px" h="18px" borderRadius="md" bg="panel.elevated" />}
									</HStack>
									<VStack align="flex-end" spacing={0.5} flexShrink={0}>
										<Box w={row.valW} h="16px" borderRadius="md" bg="panel.elevated" />
										{row.hasHelper && <Box w="100px" h="12px" borderRadius="sm" bg="panel.elevated" mt={0.5} />}
									</VStack>
								</Flex>
							))}
						</Stack>
					</Box>
				</Box>

				{canSeeGlobal && (
					<Box
						className="shimmer-box"
						bg="panel.surface"
						borderRadius="20px"
						borderWidth="1px"
						borderColor="panel.border"
						overflow="hidden"
						boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px -6px rgba(0, 0, 0, 0.12)"
					>
						<Flex px={{ base: 4, sm: 5, md: 6 }} py={3.5} justify="space-between" align="center" borderBottomWidth="1px" borderColor="panel.border">
							<HStack spacing={2.5}>
								<Box w="26px" h="26px" borderRadius="7px" bg="panel.elevated" />
								<Box w="85px" h="16px" borderRadius="md" bg="panel.elevated" />
							</HStack>
						</Flex>
						<Box p={{ base: 4, sm: 5, md: 6 }}>
							<Stack spacing={0}>
								{[
									{ id: "skel-a-total", labelW: "75px", valW: "40px" },
									{ id: "skel-a-full", labelW: "85px", valW: "40px" },
									{ id: "skel-a-sudo", labelW: "65px", valW: "40px" },
									{ id: "skel-a-standard", labelW: "80px", valW: "40px" },
									{ id: "skel-a-top", labelW: "75px", valW: "120px" },
								].map((row, idx) => (
									<Flex
										key={row.id}
										justify="space-between"
										align="center"
										py={2.5}
										borderBottomWidth={idx === 4 ? "0" : "1px"}
										borderColor="panel.border"
									>
										<HStack spacing={3} minW={0}>
											<Box w="7px" h="7px" borderRadius="full" bg="panel.elevated" me="3px" flexShrink={0} />
											<Box w={row.labelW} h="14px" borderRadius="md" bg="panel.elevated" />
										</HStack>
										<Box w={row.valW} h="16px" borderRadius="md" bg="panel.elevated" />
									</Flex>
								))}
							</Stack>
						</Box>
					</Box>
				)}
			</Stack>
		);
	}

	const activePercent =
		systemData.total_user > 0
			? formatPercent((systemData.users_active / systemData.total_user) * 100, isRTL)
			: formatPercent(0, isRTL);
	const onlinePercent =
		systemData.total_user > 0
			? formatPercent((systemData.online_users / systemData.total_user) * 100, isRTL)
			: formatPercent(0, isRTL);

	const myTotalUsers = myUsersData?.total ?? systemData.personal_usage?.total_users ?? 0;
	const myActiveUsers = myUsersData?.active_total ?? myUsersData?.status_breakdown?.active ?? myTotalUsers;
	const myOnlineUsers = myUsersData?.online_total ?? 0;

	const myActivePercent =
		myTotalUsers > 0
			? formatPercent((myActiveUsers / myTotalUsers) * 100, isRTL)
			: formatPercent(0, isRTL);
	const myOnlinePercent =
		myTotalUsers > 0
			? formatPercent((myOnlineUsers / myTotalUsers) * 100, isRTL)
			: formatPercent(0, isRTL);

	const myUsersList = myUsersData?.users ?? [];
	const myOnHoldUsers = myUsersData?.status_breakdown?.on_hold ?? myUsersList.filter((u) => u.status === "on_hold").length;
	const myLimitedUsers = myUsersData?.status_breakdown?.limited ?? myUsersList.filter((u) => u.status === "limited").length;
	const myExpiredUsers = myUsersData?.status_breakdown?.expired ?? myUsersList.filter((u) => u.status === "expired").length;
	const myOnlineUploadSpeed = myUsersList.reduce((sum, u) => sum + (Number(u.upload_speed) || 0), 0);
	const myOnlineDownloadSpeed = myUsersList.reduce((sum, u) => sum + (Number(u.download_speed) || 0), 0);
	const myActiveUsersUsedTraffic = myUsersList.reduce((sum, u) => sum + (Number(u.used_traffic) || 0), 0);

	const panelInfo = maintenanceInfo?.panel;
	const exactVersion =
		panelInfo?.tag ||
		panelInfo?.update?.current ||
		(systemData.channel?.toLowerCase() === "dev" ? "dev" : systemData.version) ||
		"-";

	return (
		<Stack
			spacing={{ base: 4, md: 5 }}
			w="full"
			dir={isRTL ? "rtl" : "ltr"}
			position="relative"
			_before={{
				content: '""',
				position: "absolute",
				top: "-80px",
				left: "8%",
				right: "8%",
				height: "320px",
				background:
					"radial-gradient(ellipse 65% 45% at 50% 0%, var(--rb-panel-accent-soft), transparent 70%)",
				opacity: 0.65,
				pointerEvents: "none",
				zIndex: 0,
				filter: "blur(48px)",
			}}
			{...props}
		>
			{canSeeGlobal && <SystemDiagnostics issues={criticalIssues} criticalOnly />}
			<Flex align="center" justify="space-between" flexWrap="wrap" gap={3} px={1}>
				<Flex
					wrap="wrap"
					gap={{ base: 2.5, md: 1 }}
					sx={{
						flexDirection: "column",
						alignItems: "flex-start",
						"@media screen and (max-width: 767px)": {
							flexDirection: "row",
							alignItems: "center",
						},
						"@media screen and (min-width: 768px) and (max-width: 991px)": {
							"body:has([data-sidebar-collapsed='true']) &": {
								flexDirection: "row",
								alignItems: "center",
							},
							"body:not(:has([data-sidebar-collapsed='true'])) &": {
								flexDirection: "column",
								alignItems: "flex-start",
							},
						},
						"@media screen and (min-width: 992px)": {
							flexDirection: "column",
							alignItems: "flex-start",
						},
					}}
				>
					<Text fontSize={{ base: "18px", md: "20px" }} fontWeight="700" color="panel.text" letterSpacing="-0.02em">
						{t("dashboard.system.overview")}
					</Text>
					<Flex align="center" gap={2} direction="row">
						<Box
							w="7px"
							h="7px"
							borderRadius="full"
							bg={systemData.xray_running && !hasXrayError ? "#22c55e" : "#ef4444"}
							sx={{
								animation: systemData.xray_running && !hasXrayError ? "livePulse 3.5s ease-in-out infinite" : "none",
								boxShadow: systemData.xray_running && !hasXrayError
									? "0 0 5px rgba(34, 197, 94, 0.4)"
									: "0 0 5px rgba(239, 68, 68, 0.4)",
								"@keyframes livePulse": {
									"0%, 100%": { opacity: 0.65, transform: "scale(1)" },
									"50%": { opacity: 1, transform: "scale(1.08)", boxShadow: "0 0 8px rgba(34, 197, 94, 0.6)" },
								},
							}}
						/>
						<Text fontSize="12px" color="panel.textSecondary" fontWeight="600">
							{hasXrayError ? t("diagnostics.statusError") : systemData.xray_running ? t("dashboard.system.statusRunning") : t("dashboard.system.statusStopped")}
						</Text>
						{systemData.os && (
							<HStack spacing={1.5} align="center" color="panel.textSecondary" fontSize="12px" fontWeight="600">
								<Text as="span">·</Text>
								<Text as="span" dir="ltr" sx={{ unicodeBidi: "isolate" }}>
									{systemData.os}
								</Text>
							</HStack>
						)}
						{exactVersion && exactVersion !== "-" && (
							<HStack spacing={1.5} align="center" color="panel.textSecondary" fontSize="12px" fontWeight="600">
								<Text as="span">·</Text>
								<Text as="span" dir="ltr" sx={{ unicodeBidi: "isolate" }}>
									{exactVersion}
								</Text>
							</HStack>
						)}
					</Flex>
				</Flex>
				<DashboardMaintenanceControls channel={systemData.channel} version={systemData.version} />
			</Flex>

			<SimpleGrid
				columns={{ base: 2, md: 4 }}
				gap={{ base: 2.5, sm: 3, md: 4 }}
				sx={{
					"@media screen and (min-width: 768px) and (max-width: 910px)": {
						"body:not(:has([data-sidebar-collapsed='true'])) &": {
							gridTemplateColumns: "1fr !important",
						},
					},
				}}
			>
				<ResourceCard
					label={t("dashboard.system.cpuUsage")}
					icon={<CpuChipIcon width={16} />}
					value={formatPercent(systemData.cpu_usage, false)}
					percent={systemData.cpu_usage}
					badgeText={`${systemData.cpu_cores} ${t("dashboard.system.core", "Core")}`}
					subMeta={
						systemData.load_avg && systemData.load_avg.length >= 3 ? (
							<Flex
								align="center"
								gap={1}
								fontSize={{ base: "10px", sm: "11px" }}
								fontWeight="500"
								color="panel.textMuted"
								dir={isRTL ? "rtl" : "ltr"}
							>
								<Text as="span">{t("loadAverage")}:</Text>
								<Text
									as="span"
									dir="ltr"
									sx={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
								>
									{systemData.load_avg.slice(0, 3).map((v) => v.toFixed(2)).join(" · ")}
								</Text>
							</Flex>
						) : undefined
					}
					footerLeft={`• ${t("dashboard.system.average")}: ${formatPercent(average(systemData.cpu_history.map((e) => e.value)), isRTL)}`}
					footerRight={`• ${t("dashboard.system.peak")}: ${formatPercent(peak(systemData.cpu_history.map((e) => e.value)), isRTL)}`}
					historyLabel={t("dashboard.system.viewHistory")}
					isRTL={isRTL}
					onHistory={() =>
						openHistory({
							type: "cpu",
							title: t("dashboard.system.cpuUsage"),
							metricLabel: t("dashboard.system.cpuUsage"),
							entries: systemData.cpu_history,
						})
					}
				/>
				<ResourceCard
					label={t("dashboard.system.memoryUsage")}
					icon={<ServerStackIcon width={16} />}
					value={formatBytes(systemData.memory.current, 1)}
					totalValue={formatBytes(systemData.memory.total, 1)}
					percent={systemData.memory.percent}
					badgeText={formatPercent(systemData.memory.percent, false)}
					footerLeft={`• ${t("dashboard.system.average")}: ${formatPercent(average(systemData.memory_history.map((e) => e.value)), isRTL)}`}
					footerRight={`• ${t("dashboard.system.peak")}: ${formatPercent(peak(systemData.memory_history.map((e) => e.value)), isRTL)}`}
					historyLabel={t("dashboard.system.viewHistory")}
					isRTL={isRTL}
					onHistory={() =>
						openHistory({
							type: "memory",
							title: t("dashboard.system.memoryUsage"),
							metricLabel: t("dashboard.system.memoryUsage"),
							entries: systemData.memory_history,
						})
					}
				/>
				<ResourceCard
					label={t("dashboard.system.swapUsage")}
					icon={<CircleStackIcon width={16} />}
					value={formatBytes(systemData.swap.current, 1)}
					totalValue={formatBytes(systemData.swap.total, 1)}
					percent={systemData.swap.percent}
					badgeText={formatPercent(systemData.swap.percent, false)}
					footerLeft={`• ${t("dashboard.system.average")}: ${formatPercent(average(systemData.swap_history.map((e) => e.value)), isRTL)}`}
					footerRight={`• ${t("dashboard.system.peak")}: ${formatPercent(peak(systemData.swap_history.map((e) => e.value)), isRTL)}`}
					isRTL={isRTL}
				/>
				<ResourceCard
					label={t("dashboard.system.diskUsage")}
					icon={<CircleStackIcon width={16} />}
					value={formatBytes(systemData.disk.current, 1)}
					totalValue={formatBytes(systemData.disk.total, 1)}
					percent={systemData.disk.percent}
					badgeText={formatPercent(systemData.disk.percent, false)}
					footerLeft={`• ${t("dashboard.system.free")}: ${formatBytes(Math.max(0, systemData.disk.total - systemData.disk.current), 1)}`}
					footerRight={`• ${t("dashboard.system.average")}: ${formatPercent(average(systemData.disk_history.map((e) => e.value)), isRTL)}`}
					isRTL={isRTL}
				/>
			</SimpleGrid>

			<SimpleGrid
				columns={{ base: 1, md: 2 }}
				gap={{ base: 3, md: 4 }}
				sx={{
					"@media screen and (min-width: 768px) and (max-width: 910px)": {
						"body:not(:has([data-sidebar-collapsed='true'])) &": {
							gridTemplateColumns: "1fr !important",
						},
					},
				}}
			>
				<SectionCard
					title={
						<HStack spacing={2.5}>
							<Flex
								w="26px"
								h="26px"
								align="center"
								justify="center"
								borderRadius="7px"
								bg="var(--rb-panel-accent-soft)"
								color="var(--rb-panel-accent)"
								boxShadow="0 0 10px -2px var(--rb-panel-accent-glow)"
								transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
								_groupHover={{
									transform: "scale(1.1)",
									boxShadow: "0 0 16px var(--rb-panel-accent-glow)",
								}}
							>
								<SignalIcon width={14} />
							</Flex>
							<span>{t("dashboard.system.bandwidthSpeed", "Bandwidth speed")}</span>
						</HStack>
					}
					action={
						<Button
							size="xs"
							h="22px"
							px={2.5}
							fontSize="11px"
							variant="ghost"
							borderRadius="full"
							bg="var(--rb-panel-accent-soft)"
							borderWidth="1px"
							borderColor="var(--rb-panel-accent-glow)"
							color="var(--rb-panel-accent)"
							boxShadow="0 0 8px -2px var(--rb-panel-accent-glow)"
							fontWeight="600"
							transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
							_hover={{
								bg: "var(--rb-panel-accent-glow)",
								color: "panel.text",
								transform: "scale(1.05)",
								boxShadow: "0 0 14px var(--rb-panel-accent-glow)",
							}}
							_active={{
								transform: "scale(0.96)",
							}}
							_focusVisible={{
								outline: "2px solid var(--rb-panel-accent)",
								outlineOffset: "2px",
							}}
							position="relative"
							_after={{
								content: '""',
								position: "absolute",
								top: "-10px",
								bottom: "-10px",
								left: "-10px",
								right: "-10px",
							}}
							onClick={() =>
								openHistory({
									type: "network",
									title: t("dashboard.system.bandwidthSpeed", "Bandwidth speed"),
									networkEntries: systemData.network_history,
								})
							}
						>
							{t("dashboard.system.viewHistory", "View history")}
						</Button>
					}
				>
					<Stack spacing={2.5}>
						<SpeedItem
							direction="in"
							icon={<ArrowDownTrayIcon width={13} />}
							label={t("dashboard.system.incomingSpeed", "Incoming speed")}
							value={`${formatBytes(systemData.incoming_bandwidth_speed)}/s`}
						/>
						<SpeedItem
							direction="out"
							icon={<ArrowUpTrayIcon width={13} />}
							label={t("dashboard.system.outgoingSpeed", "Outgoing speed")}
							value={`${formatBytes(systemData.outgoing_bandwidth_speed)}/s`}
						/>
					</Stack>
				</SectionCard>

				<SectionCard
					title={
						<HStack spacing={2.5}>
							<Flex
								w="26px"
								h="26px"
								align="center"
								justify="center"
								borderRadius="7px"
								bg="var(--rb-panel-accent-soft)"
								color="var(--rb-panel-accent)"
								boxShadow="0 0 10px -2px var(--rb-panel-accent-glow)"
								transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
								_groupHover={{
									transform: "scale(1.1)",
									boxShadow: "0 0 16px var(--rb-panel-accent-glow)",
								}}
							>
								<ClockIcon width={14} />
							</Flex>
							<span>{t("dashboard.system.uptime", "Uptime")}</span>
						</HStack>
					}
				>
					<Stack spacing={2.5}>
						<Flex
							align="center"
							justify="space-between"
							gap={3}
							p={{ base: 1.5, sm: 2 }}
							borderRadius="12px"
							borderWidth="1px"
							borderColor="transparent"
							transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
							_hover={{
								bg: "var(--rb-panel-accent-subtle)",
								borderColor: "var(--rb-panel-accent-soft)",
								transform: "translateX(3px)",
							}}
						>
							<HStack spacing={2.5} color="panel.textMuted">
								<Flex
									w="30px"
									h="30px"
									align="center"
									justify="center"
									borderRadius="9px"
									bg="rgba(16, 185, 129, 0.12)"
									color="#10b981"
									borderWidth="1px"
									borderColor="rgba(16, 185, 129, 0.25)"
									boxShadow="0 0 10px rgba(16, 185, 129, 0.2)"
									flexShrink={0}
									transition="all 0.25s ease"
								>
									<ServerStackIcon width={13} />
								</Flex>
								<HStack spacing={2}>
									<Text fontSize="13px" fontWeight="600" color="panel.textSecondary">
										{t("dashboard.system.systemUptime", "System uptime")}
									</Text>
									<Box
										w="6px"
										h="6px"
										borderRadius="full"
										bg="#10b981"
										boxShadow="0 0 8px #10b981"
										sx={{
											animation: "uptimePulse 2.5s ease-in-out infinite",
											"@keyframes uptimePulse": {
												"0%, 100%": { opacity: 0.4, transform: "scale(0.85)" },
												"50%": { opacity: 1, transform: "scale(1.2)", boxShadow: "0 0 10px #10b981" },
											},
										}}
									/>
								</HStack>
							</HStack>
							<Box fontSize="13px" fontWeight="700" color="panel.text">
								{formatLocalizedDuration(systemData.uptime_seconds, t, isRTL)}
							</Box>
						</Flex>
						<Flex
							align="center"
							justify="space-between"
							gap={3}
							p={{ base: 1.5, sm: 2 }}
							borderRadius="12px"
							borderWidth="1px"
							borderColor="transparent"
							transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
							_hover={{
								bg: "var(--rb-panel-accent-subtle)",
								borderColor: "var(--rb-panel-accent-soft)",
								transform: "translateX(3px)",
							}}
						>
							<HStack spacing={2.5} color="panel.textMuted">
								<Flex
									w="30px"
									h="30px"
									align="center"
									justify="center"
									borderRadius="9px"
									bg="var(--rb-panel-accent-soft)"
									color="var(--rb-panel-accent)"
									borderWidth="1px"
									borderColor="var(--rb-panel-accent-glow)"
									boxShadow="0 0 10px var(--rb-panel-accent-glow)"
									flexShrink={0}
									transition="all 0.25s ease"
								>
									<CircleStackIcon width={13} />
								</Flex>
								<HStack spacing={2}>
									<Text fontSize="13px" fontWeight="600" color="panel.textSecondary">
										{t("dashboard.system.panelUptime", "Panel uptime")}
									</Text>
									<Box
										w="6px"
										h="6px"
										borderRadius="full"
										bg="var(--rb-panel-accent)"
										boxShadow="0 0 8px var(--rb-panel-accent-glow)"
										sx={{
											animation: "panelUptimePulse 2.5s ease-in-out infinite",
											"@keyframes panelUptimePulse": {
												"0%, 100%": { opacity: 0.4, transform: "scale(0.85)" },
												"50%": { opacity: 1, transform: "scale(1.2)", boxShadow: "0 0 10px var(--rb-panel-accent-glow)" },
											},
										}}
									/>
								</HStack>
							</HStack>
							<Box fontSize="13px" fontWeight="700" color="panel.text">
								{formatLocalizedDuration(systemData.panel_uptime_seconds, t, isRTL)}
							</Box>
						</Flex>
					</Stack>
				</SectionCard>
			</SimpleGrid>

			<SectionCard
				noHover
				roleGroup={false}
				title={
					<HStack spacing={2.5}>
						<Flex
							w="26px"
							h="26px"
							align="center"
							justify="center"
							borderRadius="7px"
							bg="var(--rb-panel-accent-soft)"
							color="var(--rb-panel-accent)"
							boxShadow="0 0 10px -2px var(--rb-panel-accent-glow)"
							transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
						>
							<CpuChipIcon width={14} />
						</Flex>
						<span>{t("dashboard.system.panelUsage", "Panel Usage Stats")}</span>
					</HStack>
				}
				action={
					<Button
						size="xs"
						h="22px"
						px={2.5}
						fontSize="11px"
						variant="ghost"
						borderRadius="full"
						bg="var(--rb-panel-accent-soft)"
						borderWidth="1px"
						borderColor="var(--rb-panel-accent-glow)"
						color="var(--rb-panel-accent)"
						boxShadow="0 0 8px -2px var(--rb-panel-accent-glow)"
						fontWeight="600"
						transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
						_hover={{
							bg: "var(--rb-panel-accent-glow)",
							color: "panel.text",
							transform: "scale(1.05)",
							boxShadow: "0 0 14px var(--rb-panel-accent-glow)",
						}}
						_active={{
							transform: "scale(0.96)",
						}}
						_focusVisible={{
							outline: "2px solid var(--rb-panel-accent)",
							outlineOffset: "2px",
						}}
						position="relative"
						_after={{
							content: '""',
							position: "absolute",
							top: "-10px",
							bottom: "-10px",
							left: "-10px",
							right: "-10px",
						}}
						onClick={() =>
							openHistory({
								type: "panel",
								title: t("dashboard.system.panelUsage", "Panel Usage Stats"),
								cpuEntries: systemData.panel_cpu_history,
								memoryEntries: systemData.panel_memory_history,
							})
						}
					>
						{t("dashboard.system.viewHistory", "View history")}
					</Button>
				}
			>
				<SimpleGrid columns={{ base: 2, sm: 2 }} gap={{ base: 2.5, sm: 3, md: 4 }}>
					<ResourceCard
						label={`${t("dashboard.system.cpuUsage", "CPU usage")} (Panel)`}
						icon={<CpuChipIcon width={16} />}
						value={formatPercent(systemData.panel_cpu_percent, false)}
						percent={systemData.panel_cpu_percent}
						badgeText={`${systemData.app_threads} ${t("dashboard.system.thread", "Thread")}`}
						footerLeft={`• ${t("dashboard.system.average", "Avg.")}: ${formatPercent(average(systemData.panel_cpu_history.map((e) => e.value)), isRTL)}`}
						footerRight={`• ${t("dashboard.system.peak", "Peak")}: ${formatPercent(peak(systemData.panel_cpu_history.map((e) => e.value)), isRTL)}`}
						isRTL={isRTL}
					/>
					<ResourceCard
						label={`${t("dashboard.system.memoryUsage", "Memory usage")} (Panel)`}
						icon={<ServerStackIcon width={16} />}
						value={formatBytes(systemData.app_memory, 1)}
						totalValue={formatBytes(systemData.memory.total, 1)}
						percent={systemData.panel_memory_percent}
						badgeText={formatPercent(systemData.panel_memory_percent, false)}
						footerLeft={`• ${t("dashboard.system.average", "Avg.")}: ${formatPercent(average(systemData.panel_memory_history.map((e) => e.value)), isRTL)}`}
						footerRight={`• ${t("dashboard.system.peak", "Peak")}: ${formatPercent(peak(systemData.panel_memory_history.map((e) => e.value)), isRTL)}`}
						isRTL={isRTL}
					/>
				</SimpleGrid>
			</SectionCard>

			<SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 3, md: 4 }}>
				<SectionCard
					title={
						<HStack spacing={2.5}>
							<Flex
								w="26px"
								h="26px"
								align="center"
								justify="center"
								borderRadius="7px"
								bg="var(--rb-panel-accent-soft)"
								color="var(--rb-panel-accent)"
								boxShadow="0 0 10px -2px var(--rb-panel-accent-glow)"
								transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
								_groupHover={{
									transform: "scale(1.1)",
									boxShadow: "0 0 16px var(--rb-panel-accent-glow)",
								}}
							>
								<UserGroupIcon width={14} />
							</Flex>
							<span>{t("dashboard.users.overview", t("dashboard.users"))}</span>
						</HStack>
					}
					action={
						canSeeGlobal ? (
							<HStack
								spacing={0.5}
								bg="panel.elevated"
								p={0.5}
								borderRadius="8px"
								position="relative"
								transition="all 0.25s ease"
								_groupHover={{
									md: {
										bg: "panel.surface",
									},
								}}
							>
								<Box position="relative">
									{userTab === "all" && (
										<motion.div
											layoutId="usersOverviewTabPill"
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												right: 0,
												bottom: 0,
												borderRadius: "6px",
												backgroundColor: "var(--rb-panel-accent)",
												border: "1px solid var(--rb-panel-accent)",
												boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
												zIndex: 1,
											}}
											transition={{
												type: "tween",
												ease: "easeInOut",
												duration: 0.25,
											}}
										/>
									)}
									<Button
										size="xs"
										h="22px"
										px={2.5}
										borderRadius="6px"
										fontSize="11px"
										fontWeight="600"
										variant="ghost"
										bg="transparent !important"
										color={userTab === "all" ? "white" : "panel.text"}
										position="relative"
										zIndex={2}
										transition="all 0.2s ease"
										_hover={{
											md: {
												color: userTab === "all" ? "white" : "panel.text",
											},
										}}
										_focusVisible={{
											outline: "2px solid var(--rb-panel-accent)",
											outlineOffset: "2px",
										}}
										onClick={() => setUserTab("all")}
									>
										{t("dashboard.users.allUsers", isRTL ? "همه کاربران" : "All Users")}
									</Button>
								</Box>
								<Box position="relative">
									{userTab === "mine" && (
										<motion.div
											layoutId="usersOverviewTabPill"
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												right: 0,
												bottom: 0,
												borderRadius: "6px",
												backgroundColor: "var(--rb-panel-accent)",
												border: "1px solid var(--rb-panel-accent)",
												boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
												zIndex: 1,
											}}
											transition={{
												type: "tween",
												ease: "easeInOut",
												duration: 0.25,
											}}
										/>
									)}
									<Button
										size="xs"
										h="22px"
										px={2.5}
										borderRadius="6px"
										fontSize="11px"
										fontWeight="600"
										variant="ghost"
										bg="transparent !important"
										color={userTab === "mine" ? "white" : "panel.text"}
										position="relative"
										zIndex={2}
										transition="all 0.2s ease"
										_hover={{
											md: {
												color: userTab === "mine" ? "white" : "panel.text",
											},
										}}
										_focusVisible={{
											outline: "2px solid var(--rb-panel-accent)",
											outlineOffset: "2px",
										}}
										onClick={() => setUserTab("mine")}
									>
										{t("dashboard.users.myUsers", isRTL ? "کاربران من" : "My Users")}
									</Button>
								</Box>
							</HStack>
						) : undefined
					}
				>
					<AnimatedHeightWrapper activeKey={userTab}>
						{canSeeGlobal && userTab === "all" ? (
							<Flex
								direction={{ base: "row", sm: "row" }}
								align="center"
								justify="space-between"
								gap={{ base: 3, sm: 6 }}
								py={1}
							>
								<DonutGauge
									total={systemData.total_user}
									active={systemData.users_active}
									size={105}
								/>
								<Stack spacing={1} flex="1" minW={0}>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="var(--rb-panel-accent)" boxShadow="0 0 8px var(--rb-panel-accent-glow)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.total", isRTL ? "کل" : "Total")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{systemData.total_user}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={1.5} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#22c55e" boxShadow="0 0 8px rgba(34, 197, 94, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.active", isRTL ? "فعال" : "Active")}
											</Text>
											<Flex
												align="center"
												px={1.5}
												py={0.2}
												borderRadius="full"
												bg="rgba(34, 197, 94, 0.12)"
												borderWidth="1px"
												borderColor="rgba(34, 197, 94, 0.3)"
												boxShadow="0 0 8px rgba(34, 197, 94, 0.2)"
												color="#22c55e"
												fontSize="9.5px"
												fontWeight="700"
												dir="ltr"
												sx={{ fontVariantNumeric: "tabular-nums" }}
											>
												{activePercent}
											</Flex>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{systemData.users_active}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={1.5} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#06b6d4" boxShadow="0 0 8px rgba(6, 182, 212, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.online", isRTL ? "آنلاین" : "Online")}
											</Text>
											<Flex
												align="center"
												px={1.5}
												py={0.2}
												borderRadius="full"
												bg="rgba(6, 182, 212, 0.12)"
												borderWidth="1px"
												borderColor="rgba(6, 182, 212, 0.3)"
												boxShadow="0 0 8px rgba(6, 182, 212, 0.2)"
												color="#06b6d4"
												fontSize="9.5px"
												fontWeight="700"
												dir="ltr"
												sx={{ fontVariantNumeric: "tabular-nums" }}
											>
												{onlinePercent}
											</Flex>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{systemData.online_users}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#a855f7" boxShadow="0 0 8px rgba(168, 85, 247, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.onHold", isRTL ? "در انتظار" : "On Hold")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{systemData.users_on_hold}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#f59e0b" boxShadow="0 0 8px rgba(245, 158, 11, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.limited", isRTL ? "محدود شده" : "Limited")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{systemData.users_limited}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#f97316" boxShadow="0 0 8px rgba(249, 115, 22, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.expired", isRTL ? "منقضی شده" : "Expired")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{systemData.users_expired}
										</Text>
									</Flex>
								</Stack>
							</Flex>
						) : (
							<Flex
								direction={{ base: "row", sm: "row" }}
								align="center"
								justify="space-between"
								gap={{ base: 3, sm: 6 }}
								py={1}
							>
								<DonutGauge
									total={myTotalUsers}
									active={myActiveUsers}
									size={105}
								/>
								<Stack spacing={1} flex="1" minW={0}>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="var(--rb-panel-accent)" boxShadow="0 0 8px var(--rb-panel-accent-glow)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.total", isRTL ? "کل" : "Total")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{myTotalUsers}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={1.5} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#22c55e" boxShadow="0 0 8px rgba(34, 197, 94, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.active", isRTL ? "فعال" : "Active")}
											</Text>
											<Flex
												align="center"
												px={1.5}
												py={0.2}
												borderRadius="full"
												bg="rgba(34, 197, 94, 0.12)"
												borderWidth="1px"
												borderColor="rgba(34, 197, 94, 0.3)"
												boxShadow="0 0 8px rgba(34, 197, 94, 0.2)"
												color="#22c55e"
												fontSize="9.5px"
												fontWeight="700"
												dir="ltr"
												sx={{ fontVariantNumeric: "tabular-nums" }}
											>
												{myActivePercent}
											</Flex>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{myActiveUsers}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={1.5} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#06b6d4" boxShadow="0 0 8px rgba(6, 182, 212, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.online", isRTL ? "آنلاین" : "Online")}
											</Text>
											<Flex
												align="center"
												px={1.5}
												py={0.2}
												borderRadius="full"
												bg="rgba(6, 182, 212, 0.12)"
												borderWidth="1px"
												borderColor="rgba(6, 182, 212, 0.3)"
												boxShadow="0 0 8px rgba(6, 182, 212, 0.2)"
												color="#06b6d4"
												fontSize="9.5px"
												fontWeight="700"
												dir="ltr"
												sx={{ fontVariantNumeric: "tabular-nums" }}
											>
												{myOnlinePercent}
											</Flex>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{myOnlineUsers}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#a855f7" boxShadow="0 0 8px rgba(168, 85, 247, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.onHold", isRTL ? "در انتظار" : "On Hold")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{myOnHoldUsers}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#f59e0b" boxShadow="0 0 8px rgba(245, 158, 11, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.limited", isRTL ? "محدود شده" : "Limited")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{myLimitedUsers}
										</Text>
									</Flex>
									<Flex
										justify="space-between"
										align="center"
										px={2}
										py={1}
										borderRadius="8px"
										transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
										_hover={{ bg: "var(--rb-panel-accent-subtle)", transform: "translateX(2px)" }}
									>
										<HStack spacing={2} minW={0}>
											<Box w="6px" h="6px" borderRadius="full" bg="#f97316" boxShadow="0 0 8px rgba(249, 115, 22, 0.5)" flexShrink={0} />
											<Text fontSize="12px" fontWeight="600" color="panel.textSecondary" noOfLines={1}>
												{t("dashboard.users.expired", isRTL ? "منقضی شده" : "Expired")}
											</Text>
										</HStack>
										<Text fontSize="12px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
											{myExpiredUsers}
										</Text>
									</Flex>
									<Flex justify="space-between" align="center" pt={1} borderTop="1px solid" borderColor="panel.border">
										<Text fontSize="11px" fontWeight="600" color="panel.textMuted">
											{t("dashboard.users.currentUserUsage", isRTL ? "مصرف کاربران جاری" : "Current User Usage")}
										</Text>
										<Text fontSize="11px" fontWeight="700" color="panel.text" dir="ltr">
											{formatBytes(myActiveUsersUsedTraffic, 1)}
										</Text>
									</Flex>
								</Stack>
							</Flex>
						)}
					</AnimatedHeightWrapper>
				</SectionCard>

				{canSeeGlobal && systemData.admin_overview && (
					<SectionCard
						title={
							<HStack spacing={2.5}>
								<Flex
									w="26px"
									h="26px"
									align="center"
									justify="center"
									borderRadius="7px"
									bg="var(--rb-panel-accent-soft)"
									color="var(--rb-panel-accent)"
									boxShadow="0 0 10px -2px var(--rb-panel-accent-glow)"
									transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
									_groupHover={{
										transform: "scale(1.1)",
										boxShadow: "0 0 16px var(--rb-panel-accent-glow)",
									}}
								>
									<ShieldCheckIcon width={14} />
								</Flex>
								<span>{t("dashboard.admins.overview", isRTL ? "بررسی ادمین‌ها" : "Admin overview")}</span>
							</HStack>
						}
					>
						<Stack spacing={3}>
							<SimpleGrid columns={3} spacing={2.5}>
								<Box
									bg="panel.elevated"
									borderRadius="12px"
									p={{ base: 2, sm: 3 }}
									borderWidth="1px"
									borderColor="rgba(16, 185, 129, 0.25)"
									background="linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)"
									boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.04)"
									position="relative"
									overflow="hidden"
									_before={{
										content: '""',
										position: "absolute",
										top: 0,
										left: 0,
										right: 0,
										height: "2px",
										bg: "linear-gradient(90deg, transparent, #10b981, transparent)",
										opacity: 0.8,
									}}
									transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
									_hover={{
										borderColor: "rgba(16, 185, 129, 0.5)",
										transform: "translateY(-3px)",
										boxShadow: "0 8px 24px -4px rgba(16, 185, 129, 0.35)",
									}}
								>
									<HStack spacing={1.5} mb={1}>
										<Box w="6px" h="6px" borderRadius="full" bg="#10b981" boxShadow="0 0 8px #10b981" flexShrink={0} />
										<Text fontSize={{ base: "10px", sm: "11px" }} fontWeight="600" color="panel.textMuted" noOfLines={1}>
											{t("dashboard.admins.fullAccess", isRTL ? "مدیران دسترسی کامل" : "Full-access admins")}
										</Text>
									</HStack>
									<Text fontSize={{ base: "18px", sm: "22px" }} fontWeight="800" color="#10b981" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
										{systemData.admin_overview.full_access_admins}
									</Text>
								</Box>

								<Box
									bg="panel.elevated"
									borderRadius="12px"
									p={{ base: 2, sm: 3 }}
									borderWidth="1px"
									borderColor="rgba(168, 85, 247, 0.25)"
									background="linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0.02) 100%)"
									boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.04)"
									position="relative"
									overflow="hidden"
									_before={{
										content: '""',
										position: "absolute",
										top: 0,
										left: 0,
										right: 0,
										height: "2px",
										bg: "linear-gradient(90deg, transparent, #a855f7, transparent)",
										opacity: 0.8,
									}}
									transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
									_hover={{
										borderColor: "rgba(168, 85, 247, 0.5)",
										transform: "translateY(-3px)",
										boxShadow: "0 8px 24px -4px rgba(168, 85, 247, 0.35)",
									}}
								>
									<HStack spacing={1.5} mb={1}>
										<Box w="6px" h="6px" borderRadius="full" bg="#a855f7" boxShadow="0 0 8px #a855f7" flexShrink={0} />
										<Text fontSize={{ base: "10px", sm: "11px" }} fontWeight="600" color="panel.textMuted" noOfLines={1}>
											{t("dashboard.admins.sudo", isRTL ? "مدیران سودو" : "Sudo admins")}
										</Text>
									</HStack>
									<Text fontSize={{ base: "18px", sm: "22px" }} fontWeight="800" color="#a855f7" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
										{systemData.admin_overview.sudo_admins}
									</Text>
								</Box>

								<Box
									bg="panel.elevated"
									borderRadius="12px"
									p={{ base: 2, sm: 3 }}
									borderWidth="1px"
									borderColor="rgba(56, 189, 248, 0.25)"
									background="linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(56, 189, 248, 0.02) 100%)"
									boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.04)"
									position="relative"
									overflow="hidden"
									_before={{
										content: '""',
										position: "absolute",
										top: 0,
										left: 0,
										right: 0,
										height: "2px",
										bg: "linear-gradient(90deg, transparent, #38bdf8, transparent)",
										opacity: 0.8,
									}}
									transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
									_hover={{
										borderColor: "rgba(56, 189, 248, 0.5)",
										transform: "translateY(-3px)",
										boxShadow: "0 8px 24px -4px rgba(56, 189, 248, 0.35)",
									}}
								>
									<HStack spacing={1.5} mb={1}>
										<Box w="6px" h="6px" borderRadius="full" bg="#38bdf8" boxShadow="0 0 8px #38bdf8" flexShrink={0} />
										<Text fontSize={{ base: "10px", sm: "11px" }} fontWeight="600" color="panel.textMuted" noOfLines={1}>
											{t("dashboard.admins.standard", isRTL ? "مدیران استاندارد" : "Standard admins")}
										</Text>
									</HStack>
									<Text fontSize={{ base: "18px", sm: "22px" }} fontWeight="800" color="#38bdf8" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
										{systemData.admin_overview.standard_admins}
									</Text>
								</Box>
							</SimpleGrid>

							<Flex justify="space-between" align="center" px={1} py={1}>
								<HStack spacing={2}>
									<Box w="6px" h="6px" borderRadius="full" bg="var(--rb-panel-accent)" boxShadow="0 0 8px var(--rb-panel-accent-glow)" flexShrink={0} />
									<Text fontSize="12px" fontWeight="600" color="panel.textSecondary">
										{t("dashboard.admins.total", isRTL ? "کل مدیران" : "Total admins")}
									</Text>
								</HStack>
								<Text fontSize="13px" fontWeight="700" color="panel.text" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
									{systemData.admin_overview.total_admins}
								</Text>
							</Flex>

							<Box
								bg="panel.elevated"
								borderRadius="12px"
								p={{ base: 2.5, sm: 3 }}
								borderWidth="1px"
								borderColor="var(--rb-panel-accent-soft)"
								background="linear-gradient(135deg, var(--rb-panel-accent-subtle) 0%, transparent 100%)"
								boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.04)"
								transition="all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
								_hover={{
									borderColor: "var(--rb-panel-accent-glow)",
									boxShadow: "0 8px 24px -4px var(--rb-panel-accent-glow)",
									transform: "translateY(-2px)",
								}}
							>
								<Flex justify="space-between" align="center" gap={2}>
									<HStack spacing={2.5} minW={0}>
										<Flex
											w="30px"
											h="30px"
											borderRadius="9px"
											bg="var(--rb-panel-accent-soft)"
											align="center"
											justify="center"
											color="var(--rb-panel-accent)"
											boxShadow="0 0 12px -2px var(--rb-panel-accent-glow)"
											flexShrink={0}
											transition="all 0.3s ease"
										>
											<ShieldCheckIcon width={16} />
										</Flex>
										<Box minW={0}>
											<Text fontSize="10px" fontWeight="600" color="panel.textMuted" noOfLines={1}>
												{t("dashboard.admins.topAdmin", isRTL ? "برترین مدیر" : "Top admin")}
											</Text>
											<Text fontSize="13px" fontWeight="700" color="panel.text" noOfLines={1}>
												{systemData.admin_overview.top_admin_username || userData.username || "admin"}
											</Text>
										</Box>
									</HStack>
									<Flex
										align="center"
										px={2.5}
										py={0.8}
										borderRadius="full"
										bg="var(--rb-panel-accent-soft)"
										borderWidth="1px"
										borderColor="var(--rb-panel-accent-glow)"
										color="var(--rb-panel-accent)"
										boxShadow="0 0 12px -2px var(--rb-panel-accent-glow)"
										fontSize="11.5px"
										fontWeight="700"
										dir="ltr"
										flexShrink={0}
										transition="all 0.25s ease"
										_hover={{
											boxShadow: "0 0 16px var(--rb-panel-accent-glow)",
											transform: "scale(1.04)",
										}}
										sx={{ fontVariantNumeric: "tabular-nums" }}
									>
										{formatBytes(systemData.admin_overview.top_admin_usage || 0)}
									</Flex>
								</Flex>
							</Box>
						</Stack>
					</SectionCard>
				)}
			</SimpleGrid>

			<HistoryModal
				isOpen={Boolean(historyPayload)}
				onClose={() => setHistoryPayload(null)}
				payload={historyPayload}
				intervalSeconds={historyInterval}
				onIntervalChange={setHistoryInterval}
				t={t}
				isRTL={isRTL}
			/>
		</Stack>
	);
};
