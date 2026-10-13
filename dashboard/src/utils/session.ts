import { clearAdminsCache } from "contexts/AdminsContext";
import { clearDashboardCache } from "contexts/DashboardContext";
import { clearHostsCache } from "contexts/HostsContext";
import { clearServicesCache } from "contexts/ServicesContext";
import { queryClient } from "utils/react-query";
import { useAPIRequestErrors } from "service/http";

export const clearClientSession = () => {
	useAPIRequestErrors.getState().clear();
	localStorage.removeItem("token");
	queryClient.clear();
	queryClient.removeQueries();
	clearAdminsCache();
	clearDashboardCache();
	clearServicesCache();
	clearHostsCache();
	if (typeof document !== "undefined") {
		document.cookie =
			"rebecca_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
	}
};
