export const updateThemeColor = (themeName: string, fallback?: string) => {
	const el = document.querySelector('meta[name="theme-color"]');
	const map: Record<string, string> = {
		dark: "#0a0c10",
		light: "#f4f5f7",
		custom: fallback || "#0a0c10",
	};
	const color = fallback || map[themeName] || map.dark;
	el?.setAttribute("content", color);
};
