import {
	Badge,
	Box,
	Button,
	HStack,
	IconButton,
	Popover,
	PopoverBody,
	PopoverContent,
	PopoverTrigger,
	Portal,
	Stack,
	Text,
} from "@chakra-ui/react";
import { BellIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { NotificationItem } from "types/Notification";
import { getNotifications, markNotificationsRead } from "service/notifications";

export const NotificationBell = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const inbox = useQuery(
		["notifications", "bell"],
		() => getNotifications({ limit: 6 }),
		{ refetchInterval: 30000 },
	);
	const markAll = useMutation(() => markNotificationsRead({ all: true }), {
		onSuccess: () => queryClient.invalidateQueries("notifications"),
	});
	const markOne = useMutation(
		(id: number) => markNotificationsRead({ ids: [id] }),
		{
			onSuccess: () => queryClient.invalidateQueries("notifications"),
		},
	);
	const unread = inbox.data?.unread ?? 0;
	const items = inbox.data?.items ?? [];

	const openItem = (item: NotificationItem) => {
		if (item.read_at === null) {
			markOne.mutate(item.id);
		}
		navigate("/notifications");
	};

	return (
		<Popover placement="bottom-end" isLazy gutter={10}>
			<PopoverTrigger>
				<IconButton
					position="relative"
					aria-label={t("notifications.bell.label")}
					icon={
						<Box position="relative" display="inline-flex" alignItems="center" justifyContent="center">
							<BellIcon width={18} height={18} />
							{unread > 0 && (
								<Badge
									position="absolute"
									top="-6px"
									right="-8px"
									colorScheme="red"
									borderRadius="full"
									fontSize="9px"
									px={1}
									lineHeight="1.2"
								>
									{unread > 99 ? "99+" : unread}
								</Badge>
							)}
						</Box>
					}
					size="sm"
					variant="ghost"
					borderRadius="full"
					w="32px"
					h="32px"
					minW="32px"
					_hover={{ bg: "panel.elevated" }}
				/>
			</PopoverTrigger>
			<Portal>
				<PopoverContent
					w={{ base: "calc(100vw - 32px)", sm: "340px" }}
					maxW="340px"
					maxH="420px"
					overflowY="auto"
					bg="panel.surface"
					borderColor="panel.border"
					borderWidth="1px"
					borderRadius="16px"
					boxShadow="0 20px 48px -10px rgba(0, 0, 0, 0.5)"
					zIndex={2500}
				>
					<PopoverBody p={3}>
						<HStack justify="space-between" mb={2.5}>
							<Text fontWeight="700" fontSize="14px" color="panel.text">
								{t("notifications.bell.label")}
							</Text>
							{unread > 0 && (
								<Button
									size="xs"
									variant="ghost"
									color="var(--rb-panel-accent)"
									onClick={() => markAll.mutate()}
									isLoading={markAll.isLoading}
								>
									{t("notifications.inbox.markAllRead")}
								</Button>
							)}
						</HStack>
						{items.length === 0 ? (
							<Text fontSize="sm" color="panel.textMuted" py={4} textAlign="center">
								{t("notifications.bell.empty")}
							</Text>
						) : (
							<Stack spacing={2}>
								{items.map((item) => (
									<Box
										key={item.id}
										as="button"
										textAlign="start"
										p={2.5}
										borderRadius="10px"
										bg={item.read_at === null ? "panel.elevated" : "transparent"}
										borderColor="panel.border"
										borderWidth="1px"
										opacity={item.read_at === null ? 1 : 0.75}
										transition="all 0.2s ease"
										_hover={{ bg: "panel.elevated", borderColor: "var(--rb-panel-accent)" }}
										onClick={() => openItem(item)}
									>
										<Text fontSize="13px" fontWeight="700" color="panel.text" noOfLines={1}>
											{item.title}
										</Text>
										<Text fontSize="11px" color="panel.textSecondary" noOfLines={2} mt={0.5}>
											{item.body}
										</Text>
										<Text fontSize="10px" color="panel.textMuted" mt={1}>
											{dayjs.unix(item.created_at).format("YYYY-MM-DD HH:mm")}
										</Text>
									</Box>
								))}
							</Stack>
						)}
						<Button
							mt={3}
							size="sm"
							w="full"
							variant="outline"
							borderColor="panel.border"
							color="panel.text"
							_hover={{ bg: "panel.elevated", borderColor: "var(--rb-panel-accent)" }}
							borderRadius="10px"
							onClick={() => navigate("/notifications")}
						>
							{t("notifications.bell.viewAll")}
						</Button>
					</PopoverBody>
				</PopoverContent>
			</Portal>
		</Popover>
	);
};
