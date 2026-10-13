import {
	Alert,
	AlertDescription,
	AlertIcon,
	Box,
	Button,
	chakra,
	FormControl,
	FormErrorMessage,
	FormLabel,
	HStack,
	IconButton,
	Input as CInput,
	InputGroup,
	InputLeftElement,
	InputRightElement,
	Menu,
	MenuButton,
	MenuItem,
	MenuList,
	Portal,
	Text,
	useColorMode,
	useColorModeValue,
	VStack,
} from "@chakra-ui/react";
import {
	ArrowRightOnRectangleIcon,
	CheckIcon,
	EyeIcon,
	EyeSlashIcon,
	LockClosedIcon,
	MoonIcon,
	SunIcon,
	UserIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import logoUrl from "assets/logo.svg";
import { Language } from "components/Language";
import {
	type FC,
	type ReactElement,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import {
	type FieldErrors,
	useForm,
	type UseFormRegisterReturn,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import {
	confirm2FASetup,
	getSession,
	login as createSession,
	logout,
	start2FASetup,
	type TOTPSetup,
	verify2FA,
} from "service/auth";
import { clearClientSession } from "utils/session";
import { updateThemeColor } from "utils/themeColor";
import { z } from "zod";

const schema = z.object({
	username: z.string().min(1, "login.fieldRequired"),
	password: z.string().min(1, "login.fieldRequired"),
});

export const LogoIcon = chakra("img", {
	baseStyle: {
		h: 8,
		w: 8,
	},
});

const LoginIcon = chakra(ArrowRightOnRectangleIcon, {
	baseStyle: {
		h: 5,
		strokeWidth: "2px",
		w: 5,
	},
});

const Eye = chakra(EyeIcon, { baseStyle: { h: 4, w: 4 } });
const EyeSlash = chakra(EyeSlashIcon, { baseStyle: { h: 4, w: 4 } });
const User = chakra(UserIcon, { baseStyle: { h: 5, strokeWidth: "1.8px", w: 5 } });
const Lock = chakra(LockClosedIcon, {
	baseStyle: { h: 5, strokeWidth: "1.8px", w: 5 },
});
const Moon = chakra(MoonIcon, { baseStyle: { h: 4, w: 4 } });
const Sun = chakra(SunIcon, { baseStyle: { h: 4, w: 4 } });
const Check = chakra(CheckIcon, { baseStyle: { h: 4, w: 4 } });

const THEME_KEY = "rb-theme";
const CHAKRA_THEME_KEY = "chakra-ui-color-mode";
const CUSTOM_THEMES_KEY = "rb-custom-themes";

type LoginThemeMode = "dark" | "light";

type LoginFormValues = {
	username: string;
	password: string;
};

type LoginFieldProps = {
	autoComplete: string;
	dir: "ltr" | "rtl";
	endElement?: ReactNode;
	errorMessage?: string;
	icon: ReactNode;
	label: string;
	placeholder: string;
	registration: UseFormRegisterReturn;
	type?: string;
};

const cardVariants = {
	initial: {
		opacity: 0,
		y: 28,
		scale: 0.95,
	},
	animate: {
		opacity: 1,
		y: 0,
		scale: 1,
		filter: "blur(0px)",
		transition: {
			duration: 0.55,
			ease: [0.16, 1, 0.3, 1],
		},
	},
	success: {
		opacity: 0,
		scale: 1.28,
		filter: "blur(16px)",
		y: -12,
		transition: {
			duration: 0.55,
			ease: [0.22, 1, 0.36, 1],
		},
	},
};

const LoginField: FC<LoginFieldProps> = ({
	autoComplete,
	dir,
	endElement,
	errorMessage,
	icon,
	label,
	placeholder,
	registration,
	type = "text",
}) => {
	const isInvalid = Boolean(errorMessage);
	const fieldBg = useColorModeValue("white", "var(--rb-panel-main)");
	const borderColor = useColorModeValue(
		"var(--rb-panel-border)",
		"var(--rb-panel-border)",
	);
	const textColor = useColorModeValue(
		"var(--rb-panel-text)",
		"var(--rb-panel-text)",
	);
	const mutedColor = useColorModeValue(
		"var(--rb-panel-text-muted)",
		"var(--rb-panel-text-muted)",
	);

	return (
		<FormControl isInvalid={isInvalid}>
			<FormLabel
				color={textColor}
				fontSize="sm"
				fontWeight="700"
				letterSpacing="0"
				mb={2}
			>
				{label}
			</FormLabel>
			<InputGroup dir={dir}>
				<InputLeftElement color={isInvalid ? "red.400" : mutedColor} h="44px">
					{icon}
				</InputLeftElement>
				<CInput
					{...registration}
					autoComplete={autoComplete}
					bg={fieldBg}
					borderColor={isInvalid ? "red.400" : borderColor}
					borderRadius="10px"
					color={textColor}
					fontSize="sm"
					h="44px"
					pe={endElement ? "3rem" : 4}
					placeholder={placeholder}
					ps="3rem"
					type={type}
					transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
					_placeholder={{ color: mutedColor }}
					_hover={{
						borderColor: isInvalid
							? "red.400"
							: "var(--rb-panel-border-strong)",
					}}
					_focusVisible={{
						borderColor: isInvalid ? "red.400" : "var(--rb-panel-accent)",
						boxShadow: isInvalid
							? "0 0 0 1px rgba(248, 113, 113, 0.6)"
							: "0 0 0 1px var(--rb-panel-accent)",
					}}
				/>
				{endElement && (
					<InputRightElement color={mutedColor} h="44px">
						{endElement}
					</InputRightElement>
				)}
			</InputGroup>
			<FormErrorMessage fontSize="xs">{errorMessage}</FormErrorMessage>
		</FormControl>
	);
};

const applyLoginThemeMode = (theme: LoginThemeMode) => {
	try {
		localStorage.setItem(THEME_KEY, theme);
		localStorage.setItem(CHAKRA_THEME_KEY, theme);
		localStorage.removeItem(CUSTOM_THEMES_KEY);
	} catch {}

	const targets = [document.documentElement, document.body].filter(
		Boolean,
	) as HTMLElement[];
	targets.forEach((target) => {
		target.classList.remove(
			"rb-theme-light",
			"rb-theme-dark",
			"chakra-ui-light",
			"chakra-ui-dark",
		);
		target.classList.add(`rb-theme-${theme}`, `chakra-ui-${theme}`);
		target.dataset.theme = theme;
		target.style.colorScheme = theme;
	});
	updateThemeColor(theme);
};

const LoginThemeMenu: FC = () => {
	const { t } = useTranslation();
	const { colorMode, setColorMode } = useColorMode();
	const activeTheme = colorMode === "light" ? "light" : "dark";
	const menuBg = useColorModeValue("panel.surface", "panel.surface");
	const menuBorder = useColorModeValue("panel.border", "panel.border");
	const hoverBg = useColorModeValue("panel.elevated", "panel.elevated");
	const textColor = useColorModeValue("panel.text", "panel.text");

	const selectTheme = (theme: LoginThemeMode) => {
		applyLoginThemeMode(theme);
		setColorMode(theme);
	};

	const options: Array<{
		key: LoginThemeMode;
		label: string;
		icon: ReactElement;
	}> = [
		{ key: "dark", label: t("theme.dark"), icon: <Moon /> },
		{ key: "light", label: t("theme.light"), icon: <Sun /> },
	];

	return (
		<Menu placement="bottom-end" strategy="fixed" autoSelect={false}>
			<MenuButton
				as={IconButton}
				aria-label={t("header.theme")}
				icon={activeTheme === "dark" ? <Moon /> : <Sun />}
				size="sm"
				variant="ghost"
			/>
			<Portal>
				<MenuList
					bg={menuBg}
					borderColor={menuBorder}
					color={textColor}
					minW="150px"
					p={1}
				>
					{options.map((option) => (
						<MenuItem
							key={option.key}
							icon={option.icon}
							onClick={() => selectTheme(option.key)}
							_hover={{ bg: hoverBg }}
						>
							<HStack justify="space-between" w="full">
								<Text>{option.label}</Text>
								{activeTheme === option.key ? <Check /> : null}
							</HStack>
						</MenuItem>
					))}
				</MenuList>
			</Portal>
		</Menu>
	);
};

export const Login: FC = () => {
	const [error, setError] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [step, setStep] = useState<"credentials" | "otp" | "setup">(
		"credentials",
	);
	const [otp, setOTP] = useState("");
	const [setup, setSetup] = useState<TOTPSetup | null>(null);
	const [challengeLoading, setChallengeLoading] = useState(false);
	const [isSuccessTransition, setIsSuccessTransition] = useState(false);
	const navigate = useNavigate();
	const { t, i18n } = useTranslation();
	const dir = i18n.language === "fa" ? "rtl" : "ltr";
	const pageBg = useColorModeValue(
		"var(--rb-panel-main)",
		"var(--rb-panel-main)",
	);
	const surfaceBg = useColorModeValue(
		"var(--rb-panel-surface)",
		"var(--rb-panel-surface)",
	);
	const elevatedBg = useColorModeValue(
		"var(--rb-panel-elevated)",
		"var(--rb-panel-elevated)",
	);
	const borderColor = useColorModeValue(
		"var(--rb-panel-border)",
		"var(--rb-panel-border)",
	);
	const textColor = useColorModeValue(
		"var(--rb-panel-text)",
		"var(--rb-panel-text)",
	);
	const mutedColor = useColorModeValue(
		"var(--rb-panel-text-muted)",
		"var(--rb-panel-text-muted)",
	);
	const logoFilter = useColorModeValue(
		"brightness(0)",
		"brightness(0) invert(1)",
	);
	const accentColor = "var(--rb-panel-accent)";

	const {
		register,
		formState: { errors, isSubmitting },
		handleSubmit,
		watch,
	} = useForm<LoginFormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			password: "",
			username: "",
		},
	});

	const usernameValue = watch("username") || "";
	const passwordValue = watch("password") || "";
	const canSubmit =
		Boolean(usernameValue.trim().length) &&
		Boolean(passwordValue.trim().length) &&
		!isSubmitting;

	useEffect(() => {
		void usernameValue;
		void passwordValue;
		setError((current) => (current ? "" : current));
	}, [usernameValue, passwordValue]);

	useEffect(() => {
		getSession()
			.then(async (session) => {
				if (session.state === "active") {
					navigate("/");
				} else if (session.state === "disabled") {
					navigate("/users");
				} else if (session.state === "pending_2fa") {
					setStep("otp");
				} else {
					setSetup(await start2FASetup());
					setStep("setup");
				}
			})
			.catch(() => undefined);
	}, [navigate]);

	const completeLogin = (to: string = "/") => {
		setIsSuccessTransition(true);
		window.setTimeout(() => {
			clearClientSession();
			navigate(to);
		}, 520);
	};

	const openRequiredSetup = async () => {
		setSetup(await start2FASetup());
		setStep("setup");
	};

	const login = async (values: LoginFormValues) => {
		setError("");
		try {
			const session = await createSession(values.username, values.password);
			if (session.state === "pending_2fa") {
				setStep("otp");
				setOTP("");
			} else if (session.state === "setup_required") {
				await openRequiredSetup();
			} else if (session.state === "disabled") {
				completeLogin("/users");
			} else {
				completeLogin("/");
			}
		} catch (err: any) {
			setError(err.response?._data?.detail || "Login failed");
		}
	};

	const submitOTP = async () => {
		setError("");
		setChallengeLoading(true);
		try {
			await verify2FA(otp);
			completeLogin("/");
		} catch (err: any) {
			setError(err.response?._data?.detail || "Invalid authentication code");
		} finally {
			setChallengeLoading(false);
		}
	};

	const confirmSetup = async () => {
		setError("");
		setChallengeLoading(true);
		try {
			await confirm2FASetup(otp);
			completeLogin("/");
		} catch (err: any) {
			setError(err.response?._data?.detail || "Invalid authentication code");
		} finally {
			setChallengeLoading(false);
		}
	};

	const cancelChallenge = async () => {
		try {
			await logout();
		} finally {
			setStep("credentials");
			setOTP("");
			setSetup(null);
			setError("");
		}
	};

	const handleInvalid = async (_errors: FieldErrors<LoginFormValues>) => {
		setError("");
	};

	const passwordToggle = (
		<IconButton
			aria-label={
				showPassword
					? t("admins.hidePassword")
					: t("admins.showPassword")
			}
			color={mutedColor}
			icon={showPassword ? <EyeSlash /> : <Eye />}
			onClick={() => setShowPassword((visible) => !visible)}
			onMouseDown={(event) => event.preventDefault()}
			size="sm"
			variant="ghost"
			_hover={{ bg: "transparent", color: textColor }}
		/>
	);

	return (
		<Box
			alignItems="center"
			bg={pageBg}
			display="flex"
			justifyContent="center"
			minH="100dvh"
			px={{ base: 4, md: 10 }}
			py={{ base: 6, md: 10 }}
			w="full"
			position="relative"
			overflow="hidden"
		>
			{/* Ambient Glowing Orbs Background */}
			<Box
				position="absolute"
				inset={0}
				pointerEvents="none"
				overflow="hidden"
				zIndex={0}
			>
				<motion.div
					animate={{
						x: [0, 30, -25, 0],
						y: [0, -35, 25, 0],
						scale: isSuccessTransition ? 1.3 : [1, 1.15, 0.95, 1],
						opacity: isSuccessTransition ? 0.35 : [0.15, 0.22, 0.15],
					}}
					transition={{
						duration: isSuccessTransition ? 0.55 : 14,
						repeat: isSuccessTransition ? 0 : Infinity,
						repeatType: "reverse",
						ease: "easeInOut",
					}}
					style={{
						position: "absolute",
						top: "-15%",
						right: "-10%",
						width: "550px",
						height: "550px",
						borderRadius: "50%",
						background:
							"radial-gradient(circle, var(--rb-panel-accent, #3b82f6) 0%, transparent 70%)",
						filter: "blur(70px)",
					}}
				/>
				<motion.div
					animate={{
						x: [0, -35, 25, 0],
						y: [0, 25, -30, 0],
						scale: isSuccessTransition ? 1.4 : [1, 0.9, 1.1, 1],
						opacity: isSuccessTransition ? 0.35 : [0.12, 0.2, 0.12],
					}}
					transition={{
						duration: isSuccessTransition ? 0.55 : 18,
						repeat: isSuccessTransition ? 0 : Infinity,
						repeatType: "reverse",
						ease: "easeInOut",
					}}
					style={{
						position: "absolute",
						bottom: "-15%",
						left: "-10%",
						width: "600px",
						height: "600px",
						borderRadius: "50%",
						background:
							"radial-gradient(circle, var(--rb-panel-accent-hover, #6366f1) 0%, transparent 70%)",
						filter: "blur(80px)",
					}}
				/>
				<Box
					position="absolute"
					inset={0}
					background="radial-gradient(circle at 50% 50%, transparent 35%, rgba(0, 0, 0, 0.22) 100%)"
				/>
			</Box>

			<VStack maxW="420px" spacing={6} w="full" position="relative" zIndex={1}>
				<motion.div
					variants={cardVariants}
					initial="initial"
					animate={isSuccessTransition ? "success" : "animate"}
					style={{ width: "100%", position: "relative" }}
				>
					<Box
						bg={surfaceBg}
						borderColor={borderColor}
						borderRadius="16px"
						borderWidth="1px"
						boxShadow="0 24px 64px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05)"
						p={{ base: 6, sm: 8 }}
						w="full"
						position="relative"
						overflow="hidden"
						backdropFilter="blur(16px)"
					>
						{/* Top Accent Gradient Border Highlight */}
						<Box
							position="absolute"
							top="0"
							left="12%"
							right="12%"
							h="2px"
							bgGradient="linear(to-r, transparent, var(--rb-panel-accent, #3b82f6), transparent)"
							opacity={0.85}
						/>

						{/* Success Glow Burst */}
						{isSuccessTransition && (
							<motion.div
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: [0, 0.7, 0], scale: [0.8, 1.25, 1.8] }}
								transition={{ duration: 0.55, ease: "easeOut" }}
								style={{
									position: "absolute",
									inset: 0,
									background:
										"radial-gradient(circle, var(--rb-panel-accent, #3b82f6) 0%, transparent 70%)",
									pointerEvents: "none",
									zIndex: 2,
								}}
							/>
						)}

						<HStack justifyContent="space-between" mb={7} spacing={3}>
							<HStack color={textColor} minW={0} spacing={3}>
								<motion.div
									whileHover={{ rotate: 8, scale: 1.08 }}
									transition={{ type: "spring", stiffness: 300, damping: 15 }}
								>
									<Box
										alignItems="center"
										bg={elevatedBg}
										borderColor={borderColor}
										borderRadius="10px"
										borderWidth="1px"
										display="inline-flex"
										flexShrink={0}
										h={10}
										justifyContent="center"
										w={10}
										boxShadow="0 4px 12px rgba(0, 0, 0, 0.08)"
									>
										<LogoIcon
											alt={t("menu")}
											filter={logoFilter}
											src={logoUrl}
										/>
									</Box>
								</motion.div>
								<Text fontSize="lg" fontWeight="800" noOfLines={1}>
									Rebecca
								</Text>
							</HStack>
							<HStack flexShrink={0} spacing={2}>
								<Language triggerVariant="ghost" />
								<LoginThemeMenu />
							</HStack>
						</HStack>

						<VStack align="stretch" spacing={1} textAlign="center">
							<Text color={textColor} fontSize="lg" fontWeight="800">
								{step === "credentials"
									? t("login.welcome")
									: step === "otp"
										? t("login.twoFactorTitle")
										: t("login.setupTwoFactorTitle")}
							</Text>
							<Text color={mutedColor} fontSize="sm">
								{step === "credentials"
									? t("login.welcomeBack")
									: step === "otp"
										? t("login.twoFactorHint")
										: t("login.setupTwoFactorHint")}
							</Text>
						</VStack>

						<Box mt={6}>
							{step === "credentials" ? (
								<form onSubmit={handleSubmit(login, handleInvalid)}>
									<VStack spacing={4}>
										<LoginField
											autoComplete="username"
											dir={dir}
											errorMessage={
												errors.username?.message
													? t(errors.username.message as string)
													: undefined
											}
											icon={<User />}
											label={t("username")}
											placeholder={t("username")}
											registration={register("username")}
										/>
										<LoginField
											autoComplete="current-password"
											dir={dir}
											endElement={passwordToggle}
											errorMessage={
												errors.password?.message
													? t(errors.password.message as string)
													: undefined
											}
											icon={<Lock />}
											label={t("password")}
											placeholder={t("password")}
											registration={register("password")}
											type={showPassword ? "text" : "password"}
										/>

										<AnimatePresence mode="wait">
											{error && (
												<motion.div
													key="login-error-alert"
													initial={{ opacity: 0, y: -8, scale: 0.97 }}
													animate={{
														opacity: 1,
														y: 0,
														scale: 1,
														x: [0, -6, 6, -4, 4, 0],
													}}
													exit={{ opacity: 0, y: -8, scale: 0.97 }}
													transition={{ duration: 0.35, ease: "easeInOut" }}
													style={{ width: "100%" }}
												>
													<Alert
														borderRadius="10px"
														fontSize="sm"
														status="error"
														variant="left-accent"
														w="full"
													>
														<AlertIcon />
														<AlertDescription>{error}</AlertDescription>
													</Alert>
												</motion.div>
											)}
										</AnimatePresence>

										<motion.div
											whileHover={
												!isSubmitting && canSubmit && !isSuccessTransition
													? { scale: 1.015 }
													: {}
											}
											whileTap={
												!isSubmitting && canSubmit && !isSuccessTransition
													? { scale: 0.985 }
													: {}
											}
											style={{ width: "100%" }}
										>
											<Button
												bg={isSuccessTransition ? "green.500" : accentColor}
												borderRadius="10px"
												color="white"
												h="46px"
												isDisabled={!canSubmit || isSuccessTransition}
												isLoading={isSubmitting}
												leftIcon={
													isSuccessTransition ? <Check /> : <LoginIcon />
												}
												mt={1}
												type="submit"
												w="full"
												fontWeight="700"
												fontSize="sm"
												boxShadow="0 4px 14px 0 var(--rb-panel-accent-glow, rgba(59, 130, 246, 0.3))"
												transition="all 0.25s ease"
												_hover={{
													bg: isSuccessTransition
														? "green.500"
														: "var(--rb-panel-accent-hover)",
													boxShadow:
														"0 6px 20px 0 var(--rb-panel-accent-glow, rgba(59, 130, 246, 0.45))",
												}}
												_active={{ transform: "translateY(1px)" }}
											>
												{isSuccessTransition
													? t("common.success") || "..."
													: t("login")}
											</Button>
										</motion.div>
									</VStack>
								</form>
							) : (
								<VStack spacing={4}>
									{step === "setup" && setup && (
										<>
											<Box bg="white" borderRadius="10px" p={3}>
												<QRCodeCanvas value={setup.uri} size={180} />
											</Box>
											<Text
												color={mutedColor}
												fontFamily="mono"
												fontSize="xs"
												wordBreak="break-all"
											>
												{setup.secret}
											</Text>
										</>
									)}
									<FormControl>
										<FormLabel>{t("login.authenticationCode")}</FormLabel>
										<CInput
											autoComplete="one-time-code"
											borderRadius="10px"
											h="46px"
											inputMode="numeric"
											maxLength={6}
											textAlign="center"
											fontSize="lg"
											letterSpacing="0.2em"
											value={otp}
											onChange={(event) =>
												setOTP(event.target.value.replace(/\D/g, ""))
											}
										/>
									</FormControl>
									<AnimatePresence mode="wait">
										{error && (
											<motion.div
												key="otp-error-alert"
												initial={{ opacity: 0, y: -8, scale: 0.97 }}
												animate={{
													opacity: 1,
													y: 0,
													scale: 1,
													x: [0, -6, 6, -4, 4, 0],
												}}
												exit={{ opacity: 0, y: -8, scale: 0.97 }}
												transition={{ duration: 0.35, ease: "easeInOut" }}
												style={{ width: "100%" }}
											>
												<Alert
													borderRadius="10px"
													fontSize="sm"
													status="error"
													variant="left-accent"
													w="full"
												>
													<AlertIcon />
													<AlertDescription>{error}</AlertDescription>
												</Alert>
											</motion.div>
										)}
									</AnimatePresence>
									<motion.div
										whileHover={
											otp.length === 6 &&
											!challengeLoading &&
											!isSuccessTransition
												? { scale: 1.015 }
												: {}
										}
										whileTap={
											otp.length === 6 &&
											!challengeLoading &&
											!isSuccessTransition
												? { scale: 0.985 }
												: {}
										}
										style={{ width: "100%" }}
									>
										<Button
											bg={isSuccessTransition ? "green.500" : accentColor}
											color="white"
											borderRadius="10px"
											h="46px"
											isDisabled={otp.length !== 6 || isSuccessTransition}
											isLoading={challengeLoading}
											leftIcon={isSuccessTransition ? <Check /> : undefined}
											onClick={step === "otp" ? submitOTP : confirmSetup}
											w="full"
											fontWeight="700"
											fontSize="sm"
											boxShadow="0 4px 14px 0 var(--rb-panel-accent-glow, rgba(59, 130, 246, 0.3))"
											transition="all 0.25s ease"
										>
											{isSuccessTransition
												? t("common.success") || "..."
												: t("continue")}
										</Button>
									</motion.div>
									<Button onClick={cancelChallenge} variant="ghost" w="full">
										{t("back")}
									</Button>
								</VStack>
							)}
						</Box>
					</Box>
				</motion.div>
			</VStack>
		</Box>
	);
};

export default Login;
