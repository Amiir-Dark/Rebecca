import {
	Badge,
	Box,
	Button,
	Flex,
	FormControl,
	FormHelperText,
	FormLabel,
	Heading,
	HStack,
	Select,
	SimpleGrid,
	Stack,
	Switch,
	Text,
	Textarea,
	useToast,
} from "@chakra-ui/react";
import { PanelInput as Input } from "components/common/PanelInput";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getAPIErrorMessage } from "service/http";
import {
	getSubscriptionSettings,
	updateSubscriptionSettings,
	type SubscriptionTemplateSettingsUpdatePayload,
} from "service/settings";

export const HappAnnouncementPanel = () => {
	const { t } = useTranslation();
	const toast = useToast();
	const queryClient = useQueryClient();

	const [announcementText, setAnnouncementText] = useState("");
	const [color, setColor] = useState("");
	const [buttonText, setButtonText] = useState("");
	const [buttonLink, setButtonLink] = useState("");
	const [subExpire, setSubExpire] = useState(false);
	const [subExpireButtonLink, setSubExpireButtonLink] = useState("");

	const { data: bundle, isLoading } = useQuery(
		"subscription-settings",
		getSubscriptionSettings,
		{ refetchOnWindowFocus: false },
	);

	useEffect(() => {
		if (bundle?.settings) {
			const s = bundle.settings;
			setAnnouncementText(s.subscription_announcement ?? "");
			setColor(s.happ_sub_info_color ?? "");
			setButtonText(s.happ_sub_info_button_text ?? "");
			setButtonLink(s.happ_sub_info_button_link ?? "");
			setSubExpire(Boolean(s.happ_sub_expire));
			setSubExpireButtonLink(s.happ_sub_expire_button_link ?? "");
		}
	}, [bundle]);

	const saveMutation = useMutation(
		(payload: SubscriptionTemplateSettingsUpdatePayload) =>
			updateSubscriptionSettings(payload),
		{
			onSuccess: () => {
				queryClient.invalidateQueries("subscription-settings");
				toast({
					title: t("notifications.happ.saveSuccess", "تنظیمات اعلان Happ با موفقیت ذخیره شد"),
					status: "success",
					duration: 3000,
					isClosable: true,
				});
			},
			onError: (err) => {
				toast({
					title: t("notifications.happ.saveFailed", "خطا در ذخیره تنظیمات"),
					description: getAPIErrorMessage(err),
					status: "error",
					duration: 4000,
					isClosable: true,
				});
			},
		},
	);

	const handleSave = () => {
		saveMutation.mutate({
			subscription_announcement: announcementText.trim(),
			happ_sub_info_color: color.trim(),
			happ_sub_info_button_text: buttonText.trim(),
			happ_sub_info_button_link: buttonLink.trim(),
			happ_sub_expire: subExpire,
			happ_sub_expire_button_link: subExpireButtonLink.trim(),
			happ_announcement_target_type: "all",
			happ_announcement_target_users: "",
		});
	};

	// Determine color palette for live preview banner
	const bannerColorStyles = {
		red: {
			bg: "rgba(239, 68, 68, 0.14)",
			border: "rgba(239, 68, 68, 0.4)",
			text: "#fca5a5",
			btnBg: "#ef4444",
		},
		green: {
			bg: "rgba(16, 185, 129, 0.14)",
			border: "rgba(16, 185, 129, 0.4)",
			text: "#6ee7b7",
			btnBg: "#10b981",
		},
		blue: {
			bg: "rgba(59, 130, 246, 0.14)",
			border: "rgba(59, 130, 246, 0.4)",
			text: "#93c5fd",
			btnBg: "#3b82f6",
		},
	}[color || "blue"] || {
		bg: "rgba(59, 130, 246, 0.14)",
		border: "rgba(59, 130, 246, 0.4)",
		text: "#93c5fd",
		btnBg: "#3b82f6",
	};

	return (
		<Stack spacing={6}>
			{/* Top Explanation & Header */}
			<Box
				p={5}
				borderRadius="xl"
				bg="panel.elevated"
				borderWidth="1px"
				borderColor="panel.border"
			>
				<Flex
					justify="space-between"
					align={{ base: "flex-start", sm: "center" }}
					direction={{ base: "column", sm: "row" }}
					gap={3}
					mb={2}
				>
					<HStack spacing={3}>
						<Heading size="md">
							{t("settings.subscriptions.happAnnouncementTitle", "اعلان و مدیریت کلاینت Happ")}
						</Heading>
						<Badge colorScheme="purple" variant="solid" px={2.5} py={0.5} borderRadius="full" fontSize="xs">
							Happ Client
						</Badge>
					</HStack>
					<Button
						colorScheme="primary"
						size="sm"
						isLoading={saveMutation.isLoading || isLoading}
						onClick={handleSave}
						px={5}
					>
						{t("save", "ذخیره تغییرات")}
					</Button>
				</Flex>
				<Text fontSize="sm" color="panel.textSecondary">
					{t(
						"settings.subscriptions.happAnnouncementDesc",
						"مدیریت متن پیام اطلاعیه، بنر اطلاعاتی و اعلان انقضا در کلاینت Happ از طریق سابسکریپشن.",
					)}
				</Text>
			</Box>

			{/* Interactive Live Happ Preview */}
			<Box
				p={5}
				borderRadius="xl"
				bg="#0e1117"
				borderWidth="1px"
				borderColor="rgba(255, 255, 255, 0.08)"
				boxShadow="0 10px 30px rgba(0, 0, 0, 0.4)"
			>
				<Flex justify="space-between" align="center" mb={3} wrap="wrap" gap={2}>
					<HStack spacing={2}>
						<Box w="8px" h="8px" borderRadius="full" bg="#10b981" boxShadow="0 0 8px #10b981" />
						<Text fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.400" letterSpacing="0.05em">
							{t("notifications.happ.previewTitle", "پیش‌نمایش زنده در برنامه Happ")}
						</Text>
					</HStack>
					<Badge variant="outline" colorScheme="gray" fontSize="2xs">
						Live Mobile Preview
					</Badge>
				</Flex>

				{/* Mockup Container */}
				<Box
					bg="#1a1e27"
					borderRadius="12px"
					p={4}
					borderWidth="1px"
					borderColor="rgba(255, 255, 255, 0.06)"
					maxW="480px"
					mx="auto"
				>
					{/* Status Bar line as shown in user's screenshot */}
					<Flex
						align="center"
						justify="space-between"
						bg="#141822"
						p="10px 14px"
						borderRadius="10px"
						borderWidth="1px"
						borderColor="rgba(255, 255, 255, 0.08)"
					>
						<HStack spacing={3} flex="1">
							<Box
								w="20px"
								h="20px"
								borderRadius="full"
								borderWidth="1px"
								borderColor="#3b82f6"
								color="#3b82f6"
								display="flex"
								alignItems="center"
								justifyContent="center"
								fontSize="11px"
								fontWeight="bold"
							>
								i
							</Box>
							<Box
								px={3}
								py="3px"
								borderRadius="full"
								borderWidth="1px"
								borderColor="rgba(255, 255, 255, 0.15)"
								fontSize="xs"
								color="#f1f5f9"
								fontFamily="mono"
							>
								0MB / ∞
							</Box>
						</HStack>
						<HStack spacing={2}>
							<Text fontSize="xs" color="#94a3b8">
								Expires: 11.11.2026
							</Text>
							<Text color="#3b82f6" fontSize="sm">
								✈
							</Text>
						</HStack>
					</Flex>

					{/* The Announcement Banner (Placed cleanly under the status line, exactly where user requested) */}
					{announcementText.trim() ? (
						<Box
							mt={3}
							p="10px 14px"
							borderRadius="10px"
							bg={bannerColorStyles.bg}
							borderWidth="1px"
							borderColor={bannerColorStyles.border}
							transition="all 0.2s"
						>
							<Flex justify="space-between" align="center" gap={3}>
								<Text fontSize="xs" color={bannerColorStyles.text} fontWeight="medium" flex="1">
									{announcementText.trim()}
								</Text>
								{buttonText.trim() && (
									<Button
										size="xs"
										bg={bannerColorStyles.btnBg}
										color="white"
										_hover={{ opacity: 0.9 }}
										borderRadius="md"
										px={3}
										h="24px"
										fontSize="2xs"
									>
										{buttonText.trim()}
									</Button>
								)}
							</Flex>
						</Box>
					) : (
						<Box
							mt={3}
							p={3}
							textAlign="center"
							borderRadius="8px"
							borderStyle="dashed"
							borderWidth="1px"
							borderColor="rgba(255, 255, 255, 0.1)"
							color="gray.500"
							fontSize="xs"
						>
							{t("notifications.happ.emptyPreview", "متن اعلان خالی است (اعلانی در کلاینت نمایش داده نمی‌شود)")}
						</Box>
					)}

					{/* Smart Expire Preview */}
					{subExpire && (
						<Box
							mt={2}
							p="8px 12px"
							borderRadius="8px"
							bg="rgba(245, 158, 11, 0.14)"
							borderWidth="1px"
							borderColor="rgba(245, 158, 11, 0.35)"
						>
							<Flex justify="space-between" align="center">
								<Text fontSize="xs" color="#fbbf24">
									Your subscription expires in 3 days!
								</Text>
								<Button size="xs" colorScheme="orange" h="22px" fontSize="2xs">
									Renew
								</Button>
							</Flex>
						</Box>
					)}
				</Box>
			</Box>

			{/* Configuration Form */}
			<Box
				p={5}
				borderRadius="xl"
				bg="panel.elevated"
				borderWidth="1px"
				borderColor="panel.border"
			>
				<SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
					{/* Announcement Text */}
					<FormControl gridColumn={{ base: "1 / -1", md: "1 / -1" }}>
						<Flex justify="space-between" align="center" mb={1.5}>
							<FormLabel mb={0} fontSize="sm" fontWeight="semibold">
								{t("settings.subscriptions.announcementText", "متن اعلان (sub-info-text)")}
							</FormLabel>
							<Badge
								colorScheme={announcementText.length > 200 ? "red" : "purple"}
								variant="subtle"
								fontSize="xs"
								borderRadius="md"
								px={2}
							>
								{announcementText.length} / 200
							</Badge>
						</Flex>
						<Textarea
							rows={3}
							maxLength={200}
							value={announcementText}
							onChange={(e) => setAnnouncementText(e.target.value)}
							placeholder={t(
								"settings.subscriptions.announcementPlaceholder",
								"مثال: سرورها با موفقیت به‌روزرسانی شدند. لطفاً کانفیگ‌ها را آپدیت کنید.",
							)}
						/>
						<FormHelperText fontSize="xs">
							{t(
								"settings.subscriptions.announcementHelp",
								"متن اعلان در کلاینت Happ زیر نوار وضعیت نمایش داده می‌شود (حداکثر ۲۰۰ کاراکتر). برای غیرفعال‌سازی خالی بگذارید.",
							)}
						</FormHelperText>
					</FormControl>

					{/* Banner Color */}
					<FormControl>
						<FormLabel fontSize="sm" fontWeight="semibold">
							{t("settings.subscriptions.happInfoColor", "رنگ بنر اعلان (sub-info-color)")}
						</FormLabel>
						<Select
							value={color}
							onChange={(e) => setColor(e.target.value)}
						>
							<option value="">{t("settings.subscriptions.colorDefault", "پیش‌فرض (آبی)")}</option>
							<option value="blue">{t("settings.subscriptions.colorBlue", "آبی (Blue)")}</option>
							<option value="green">{t("settings.subscriptions.colorGreen", "سبز (Green)")}</option>
							<option value="red">{t("settings.subscriptions.colorRed", "قرمز (Red)")}</option>
						</Select>
						<FormHelperText fontSize="xs">
							{t("settings.subscriptions.happInfoColorHint", "رنگ کادر اعلان در برنامه Happ.")}
						</FormHelperText>
					</FormControl>

					{/* Button Text */}
					<FormControl>
						<Flex justify="space-between" align="center" mb={1.5}>
							<FormLabel mb={0} fontSize="sm" fontWeight="semibold">
								{t("settings.subscriptions.happButtonText", "متن دکمه اقدام (sub-info-button-text)")}
							</FormLabel>
							<Badge
								colorScheme={buttonText.length > 25 ? "red" : "gray"}
								variant="subtle"
								fontSize="xs"
								borderRadius="md"
								px={1.5}
							>
								{buttonText.length} / 25
							</Badge>
						</Flex>
						<Input
							maxLength={25}
							value={buttonText}
							onChange={(e) => setButtonText(e.target.value)}
							placeholder={t("settings.subscriptions.happButtonTextPlaceholder", "مثال: عضویت در کانال")}
						/>
						<FormHelperText fontSize="xs">
							{t("settings.subscriptions.happButtonTextHint", "متن دکمه روی کادر اعلان (حداکثر ۲۵ کاراکتر - اختیاری).")}
						</FormHelperText>
					</FormControl>

					{/* Button Link */}
					<FormControl gridColumn={{ base: "1 / -1", md: "1 / -1" }}>
						<FormLabel fontSize="sm" fontWeight="semibold">
							{t("settings.subscriptions.happButtonLink", "لینک دکمه اقدام (sub-info-button-link)")}
						</FormLabel>
						<Input
							value={buttonLink}
							onChange={(e) => setButtonLink(e.target.value)}
							placeholder="https://t.me/your_channel"
						/>
						<FormHelperText fontSize="xs">
							{t("settings.subscriptions.happButtonLinkHint", "آدرس اینترنتی یا دیپ‌لینک برای باز شدن هنگام کلیک کاربر روی دکمه اعلان.")}
						</FormHelperText>
					</FormControl>

					{/* Smart Expire Toggle */}
					<FormControl
						display="flex"
						alignItems="center"
						justifyContent="space-between"
						p={4}
						borderWidth="1px"
						borderColor="panel.border"
						borderRadius="lg"
						bg="panel.surface"
					>
						<Box pr={3}>
							<FormLabel mb={0.5} fontSize="sm" fontWeight="semibold">
								{t("settings.subscriptions.happSubExpire", "اعلان هوشمند انقضا (sub-expire)")}
							</FormLabel>
							<FormHelperText mt={0} fontSize="xs">
								{t(
									"settings.subscriptions.happSubExpireHint",
									"۳ روز قبل از اتمام اشتراک یا پس از پایان، پیام هشدار انقضا به همراه دکمه تمدید در Happ نشان داده می‌شود.",
								)}
							</FormHelperText>
						</Box>
						<Switch
							colorScheme="primary"
							isChecked={subExpire}
							onChange={(e) => setSubExpire(e.target.checked)}
						/>
					</FormControl>

					{/* Smart Expire Renewal Link */}
					<FormControl>
						<FormLabel fontSize="sm" fontWeight="semibold">
							{t("settings.subscriptions.happSubExpireButtonLink", "لینک دکمه تمدید (sub-expire-button-link)")}
						</FormLabel>
						<Input
							value={subExpireButtonLink}
							onChange={(e) => setSubExpireButtonLink(e.target.value)}
							placeholder="https://t.me/your_bot?start=renew"
						/>
						<FormHelperText fontSize="xs">
							{t("settings.subscriptions.happSubExpireButtonLinkHint", "آدرس یا ربات تلگرام برای تمدید اشتراک توسط کاربر.")}
						</FormHelperText>
					</FormControl>
				</SimpleGrid>

				<Flex justify="flex-end" mt={6} pt={4} borderTopWidth="1px" borderColor="panel.border">
					<Button
						colorScheme="primary"
						isLoading={saveMutation.isLoading}
						onClick={handleSave}
						px={6}
					>
						{t("save", "ذخیره تغییرات")}
					</Button>
				</Flex>
			</Box>
		</Stack>
	);
};

export default HappAnnouncementPanel;
