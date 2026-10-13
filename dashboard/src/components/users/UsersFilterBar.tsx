import {
	Badge,
	Box,
	Button,
	Checkbox,
	chakra,
	Flex,
	IconButton,
	Popover,
	PopoverArrow,
	PopoverBody,
	PopoverCloseButton,
	PopoverContent,
	PopoverHeader,
	PopoverTrigger,
	Stack,
	Text,
	Tooltip,
	useBreakpointValue,
} from "@chakra-ui/react";
import {
	FunnelIcon,
	PlusIcon,
	QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import { PanelSelect as Select } from "components/common/PanelSelect";
import { SearchInput } from "components/common/SearchInput";
import { ADVANCED_FILTER_OPTIONS } from "components/Filters";
import { useAdminsStore } from "contexts/AdminsContext";
import { useDashboard } from "contexts/DashboardContext";
import { useServicesStore } from "contexts/ServicesContext";
import useGetUser from "hooks/useGetUser";
import debounce from "lodash.debounce";
import type React from "react";
import { type FC, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminRole, AdminStatus, UserPermissionToggle } from "types/Admin";
import { canViewUserTraffic, isUserManagementLocked } from "utils/adminTraffic";

const iconProps = {
	baseStyle: {
		w: 4,
		h: 4,
	},
};

const FilterIcon = chakra(FunnelIcon, iconProps);
const PlusIconStyled = chakra(PlusIcon, iconProps);
const HelpIcon = chakra(QuestionMarkCircleIcon, iconProps);

const formatChipCount = (value: number, locale: string) =>
	new Intl.NumberFormat(locale || "en").format(value);

/**
 * Users-only search & filter bar: mobile-first search + advanced filters
 * popover. Intentionally separate from the shared <Filters /> so the
 * Admins page keeps its own untouched toolbar.
 */
export const UsersFilterBar: FC = () => {
	const loading = useDashboard((state) => state.loading);
	const filters = useDashboard((state) => state.filters);
	const onFilterChange = useDashboard((state) => state.onFilterChange);
	const onCreateUser = useDashboard((state) => state.onCreateUser);
	const { t, i18n } = useTranslation();
	const locale = i18n.language || "en";
	const [search, setSearch] = useState("");
	const { userData } = useGetUser();
	const hasPrivilegedRole =
		userData.role === AdminRole.Sudo || userData.role === AdminRole.FullAccess;
	const hasFullAccess = userData.role === AdminRole.FullAccess;
	const userManagementLocked = isUserManagementLocked(userData);
	const isCurrentAdminDisabled =
		!hasPrivilegedRole && userData.status === AdminStatus.Disabled;
	const canCreateUsers =
		hasFullAccess ||
		Boolean(userData.permissions?.users?.[UserPermissionToggle.Create]);
	const showCreateButton =
		canCreateUsers && !isCurrentAdminDisabled && !userManagementLocked;
	const canViewTraffic = canViewUserTraffic(userData);

	const activeFilters = filters.advancedFilters ?? [];
	const serviceId = filters.serviceId;
	const ownerFilter = filters.owner;
	const matchOptions = {
		matchCase: Boolean(filters.matchCase),
		matchWholeWord: Boolean(filters.matchWholeWord),
	};
	const rawServiceOptions = useServicesStore((state) => state.serviceOptions);
	const fetchServiceOptions = useServicesStore(
		(state) => state.fetchServiceOptions,
	);
	const serviceOptions = Array.isArray(rawServiceOptions)
		? rawServiceOptions
		: [];
	const adminOptions = useAdminsStore((state) => state.adminOptions);
	const fetchAdminOptions = useAdminsStore((state) => state.fetchAdminOptions);
	const safeAdminOptions = Array.isArray(adminOptions) ? adminOptions : [];

	const debouncedSearchChange = useMemo(
		() =>
			debounce((nextSearch: string) => {
				onFilterChange({
					search: nextSearch,
					offset: 0,
				});
			}, 300),
		[onFilterChange],
	);

	useEffect(() => {
		return () => {
			debouncedSearchChange.cancel();
		};
	}, [debouncedSearchChange]);

	useEffect(() => {
		fetchServiceOptions({ limit: 1000 });
	}, [fetchServiceOptions]);

	useEffect(() => {
		if (hasPrivilegedRole) {
			fetchAdminOptions({ limit: 1000, offset: 0, sort: "username" });
		}
	}, [fetchAdminOptions, hasPrivilegedRole]);

	useEffect(() => {
		setSearch(filters.search ?? "");
	}, [filters.search]);

	const getFilterLabel = (filterKey: string) => {
		const option = ADVANCED_FILTER_OPTIONS.find(
			(item) => item.key === filterKey,
		);
		return option ? t(option.labelKey, option.fallback) : filterKey;
	};

	const toggleAdvancedFilter = (filterKey: string) => {
		const nextFilters = activeFilters.includes(filterKey)
			? activeFilters.filter((item) => item !== filterKey)
			: [...activeFilters, filterKey];
		onFilterChange({
			advancedFilters: nextFilters,
			offset: 0,
		});
	};

	const clearAdvancedFilters = () => {
		if (activeFilters.length === 0 && !serviceId && !ownerFilter) {
			return;
		}
		onFilterChange({
			advancedFilters: [],
			serviceId: undefined,
			owner: undefined,
			offset: 0,
		});
	};

	const handleServiceChange = (value: string) => {
		onFilterChange({
			serviceId: value ? Number(value) : undefined,
			offset: 0,
		});
	};

	const handleAdminChange = (value: string) => {
		onFilterChange({
			owner: value || undefined,
			offset: 0,
		});
	};

	const onSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setSearch(event.target.value);
		debouncedSearchChange(event.target.value);
	};

	const clearSearch = () => {
		debouncedSearchChange.cancel();
		setSearch("");
		onFilterChange({
			...filters,
			offset: 0,
			search: "",
		});
	};

	const handleCreate = () => {
		if (!showCreateButton) return;
		onCreateUser(true);
	};

	const isMobile = useBreakpointValue({ base: true, sm: false }) ?? false;

	const activeFilterTotal =
		activeFilters.length + (serviceId ? 1 : 0) + (ownerFilter ? 1 : 0);
	const hasClearableFilters = activeFilterTotal > 0;

	return (
		<Flex align="center" gap={2} w="full" minW={0}>
			<SearchInput
				containerProps={{
					flex: "1 1 auto",
					minW: 0,
					maxW: { base: "100%", sm: "380px" },
				}}
				className="rb-users-search-input"
				placeholder={t("search")}
				value={search}
				onChange={onSearchChange}
				matchOptions={matchOptions}
				onMatchOptionsChange={(options) =>
					onFilterChange({
						matchCase: options.matchCase,
						matchWholeWord: options.matchWholeWord,
						offset: 0,
					})
				}
				isLoading={loading}
				onClear={clearSearch}
				borderRadius="full"
				borderColor="panel.border"
				bg="panel.surface"
				_hover={{
					borderColor: "panel.borderStrong",
				}}
				_focusVisible={{
					borderColor: "var(--rb-panel-accent)",
					boxShadow: "0 0 16px -2px var(--rb-panel-accent-glow)",
					bg: "panel.surface",
				}}
				rightElement={
					<Tooltip label={t("users.searchHelp")} placement="top" hasArrow>
						<Box
							display="inline-flex"
							alignItems="center"
							color="panel.textMuted"
							px={1}
						>
							<HelpIcon />
						</Box>
					</Tooltip>
				}
			/>

			<Popover placement="bottom-end">
				<PopoverTrigger>
					<Box position="relative" flexShrink={0}>
						<IconButton
							aria-label={t("filters.advancedButton")}
							icon={<FilterIcon />}
							variant="ghost"
							borderRadius="full"
							borderWidth="1px"
							borderColor="panel.border"
							bg="panel.surface"
							w="40px"
							h="40px"
							transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
							_hover={{
								borderColor: "var(--rb-panel-accent-glow)",
								bg: "var(--rb-panel-accent-soft)",
								color: "var(--rb-panel-accent)",
								transform: "scale(1.04)",
								boxShadow: "0 0 14px var(--rb-panel-accent-glow)",
							}}
							_active={{
								transform: "scale(0.96)",
							}}
						/>
						{hasClearableFilters && (
							<Badge
								className="rb-users-filter-badge"
								bg="var(--rb-panel-accent)"
								color="white"
								boxShadow="0 0 10px var(--rb-panel-accent-glow)"
								variant="solid"
								borderRadius="full"
								position="absolute"
								top="-3px"
								insetInlineEnd="-3px"
								fontSize="0.62rem"
								px={1.5}
								py={0.2}
								pointerEvents="none"
							>
								{formatChipCount(activeFilterTotal, locale)}
							</Badge>
						)}
					</Box>
				</PopoverTrigger>
				<PopoverContent
					bg="panel.surface"
					borderColor="panel.border"
					borderRadius="18px"
					boxShadow="inset 0 1px 1px 0 rgba(255, 255, 255, 0.08), 0 20px 50px rgba(0, 0, 0, 0.6)"
					minW="270px"
					overflow="hidden"
				>
					<PopoverArrow bg="panel.surface" />
					<PopoverCloseButton />
					<PopoverHeader
						fontWeight="bold"
						borderColor="panel.border"
						fontSize="sm"
						py={3}
					>
						{t("filters.advancedTitle")}
					</PopoverHeader>
					<PopoverBody py={3}>
						<Stack spacing={2.5}>
							{ADVANCED_FILTER_OPTIONS.filter(
								(option) => option.key !== "top_speed" || canViewTraffic,
							).map((option) => (
								<Checkbox
									key={option.key}
									isChecked={activeFilters.includes(option.key)}
									onChange={() => toggleAdvancedFilter(option.key)}
									colorScheme="red"
								>
									<Text fontSize="sm">{getFilterLabel(option.key)}</Text>
								</Checkbox>
							))}
						</Stack>
						<Stack spacing={3} mt={4} pt={3} borderTopWidth="1px" borderColor="panel.border">
							<Box>
								<Text fontSize="xs" fontWeight="bold" color="panel.textSecondary" mb={1.5}>
									{t("filters.advanced.serviceLabel")}
								</Text>
								<Select
									value={serviceId ? String(serviceId) : ""}
									onChange={(event) => handleServiceChange(event.target.value)}
									portalled={false}
									size="sm"
									borderRadius="10px"
								>
									<option value="">{t("filters.advanced.serviceAll")}</option>
									{serviceOptions.map((service) => (
										<option key={service.id} value={String(service.id)}>
											{service.name}
										</option>
									))}
								</Select>
							</Box>
							{hasPrivilegedRole && (
								<Box>
									<Text fontSize="xs" fontWeight="bold" color="panel.textSecondary" mb={1.5}>
										{t("filters.advanced.adminLabel")}
									</Text>
									<Select
										value={ownerFilter ?? ""}
										onChange={(event) => handleAdminChange(event.target.value)}
										portalled={false}
										size="sm"
										borderRadius="10px"
									>
										<option value="">{t("filters.advanced.adminAll")}</option>
										<option value={userData.username}>
											{t("filters.advanced.adminMyUsers")}
										</option>
										{safeAdminOptions.map((record) => (
											<option key={record.username} value={record.username}>
												{record.username}
											</option>
										))}
									</Select>
								</Box>
							)}
						</Stack>
						<Button
							variant="ghost"
							size="sm"
							mt={3.5}
							w="full"
							borderRadius="10px"
							onClick={clearAdvancedFilters}
							isDisabled={!hasClearableFilters}
						>
							{t("filters.advancedClear")}
						</Button>
					</PopoverBody>
				</PopoverContent>
			</Popover>

			{/* On desktop the bulk/create actions sit at the end of the row;
				on mobile they stay compact next to the search field. */}
			{!isMobile && <Box flex="1 1 auto" minW={0} />}
			{showCreateButton &&
				(isMobile ? (
					<IconButton
						className="rb-users-create-btn"
						aria-label={t("createUser")}
						icon={<PlusIconStyled w={5} h={5} />}
						bg="var(--rb-panel-accent)"
						color="white"
						borderRadius="full"
						w="40px"
						h="40px"
						flexShrink={0}
						boxShadow="0 0 16px -2px var(--rb-panel-accent-glow), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)"
						transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
						_hover={{
							bg: "var(--rb-panel-accent-hover)",
							transform: "scale(1.05)",
							boxShadow: "0 0 24px var(--rb-panel-accent-glow)",
						}}
						_active={{
							transform: "scale(0.95)",
						}}
						onClick={handleCreate}
					/>
				) : (
					<Button
						className="rb-users-create-btn"
						leftIcon={<PlusIconStyled />}
						bg="var(--rb-panel-accent)"
						color="white"
						borderRadius="full"
						h="40px"
						px={5}
						fontSize="sm"
						fontWeight="bold"
						whiteSpace="nowrap"
						flexShrink={0}
						boxShadow="0 0 16px -2px var(--rb-panel-accent-glow), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)"
						transition="all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
						_hover={{
							bg: "var(--rb-panel-accent-hover)",
							transform: "translateY(-1px)",
							boxShadow: "0 0 24px var(--rb-panel-accent-glow)",
						}}
						_active={{
							transform: "scale(0.97)",
						}}
						onClick={handleCreate}
					>
						{t("createUser")}
					</Button>
				))}
		</Flex>
	);

};
