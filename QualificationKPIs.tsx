import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { getToken } from "../../../../config/config";
import DashboardAPI from "../../../../config/sub-apis/dashboard.api";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import LoadingDots from "../../../../components/LoadingDots";
import { formatTime } from "../../../../helper/fieldsHelper";
import { displayImage } from "../../../../components/Functions/CommonFunctions";

interface Owner {
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	avatar_data: {
		file: string;
		mime: string;
	} | null;
	name: string;
}

interface Account {
	id: string;
	account_name: string;
	qualification_status: string;
	image_data: string | null;
	last_activity_date: string | null;
	last_call_activity: string | null;
	last_note_activity: string | null;
	last_send_email_activity: string | null;
	last_receive_email_activity: string | null;
	owner: Owner | null;
	account_manager: Owner | null;
}

interface QualificationStatistics {
	total_count: number;
	pie_chart_data: Array<{
		qualification_status: string;
		qualification_status_key: string;
		count: number;
	}>;
}

// Color mapping for qualification statuses
const QUALIFICATION_STATUS_COLORS: Record<string, string> = {
	"SALES_QUALIFIED": "#529553",           // Green
	"MARKETING_QUALIFIED": "#2196F3",      // Blue
	"NON_QUALIFIED": "#9CA3AF",            // Gray
	"SHORTAGE_CUSTOMER": "#FF9A66",        // Orange
	"FOCUSED_ACCOUNTS": "#9333EA",         // Purple
	"TRASHED": "#E44F5D",                  // Red
};

// Fallback color for unknown statuses
const DEFAULT_COLOR = "#545454";

interface SalesPersonQualificationKPIsProps {
	isFullscreen?: boolean;
	onToggleFullscreen?: () => void;
	isActive?: boolean;
}

export default function SalesPersonQualificationKPIs({ isFullscreen = false, onToggleFullscreen, isActive = true }: SalesPersonQualificationKPIsProps) {
	const dashboardApi = new DashboardAPI();
	const userData = getToken("userData");
	const [selectedType, setSelectedType] = useState<"all" | "my_own" | "account_manager">("all");
	const [selectedQualificationStatus, setSelectedQualificationStatus] = useState<string>("all");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [accountsData, setAccountsData] = useState<Account[]>([]);
	const [currentPage, setCurrentPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const [isAccountsLoading, setIsAccountsLoading] = useState(false);
	const [totalRecords, setTotalRecords] = useState(0);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const isLoadingRef = useRef(false);
	const perPage = isFullscreen ? 20 : 10;

	const { data: qualificationData, isLoading, isFetching } = useQuery<QualificationStatistics>({
		queryKey: ["sales-person-qualification-stats", userData?.id, selectedType],
		queryFn: async () => {
			const result = await dashboardApi.kpisAccountsByQualificationStatus("personal", userData?.id, selectedType, "", "desc", perPage, 1);
			return result.data.data.statistics;
		},
		enabled: !!userData?.id && isActive,
	});

	const fetchAccounts = useCallback(async (pageNum: number, append: boolean = false) => {
		if (isLoadingRef.current || !userData?.id || !isActive) return;

		isLoadingRef.current = true;
		setIsAccountsLoading(true);
		try {
			const qualificationStatusFilter = selectedQualificationStatus === "all" ? "" : selectedQualificationStatus;
			const result = await dashboardApi.kpisAccountsByQualificationStatus(
				"personal",
				userData?.id,
				selectedType,
				qualificationStatusFilter,
				sortOrder,
				perPage,
				pageNum
			);
			const response = result.data;

			if (response && response.data) {
				const newAccounts = response.data.accounts_with_activity || [];
				const hasMorePages = response.has_more_pages ?? false;

				if (append) {
					setAccountsData((prev) => [...prev, ...newAccounts]);
				} else {
					setAccountsData(newAccounts);
				}

				setHasMore(hasMorePages);
				setCurrentPage(pageNum);
				if (response.total_records !== undefined) {
					setTotalRecords(response.total_records);
				}
			}
		} catch (error) {
			console.error("Error fetching accounts:", error);
			setHasMore(false);
		} finally {
			setIsAccountsLoading(false);
			isLoadingRef.current = false;
		}
	}, [userData?.id, selectedType, selectedQualificationStatus, sortOrder, dashboardApi, perPage]);

	// Reset and fetch first page when type, status filter, or sort order changes or on initial load
	useEffect(() => {
		setCurrentPage(1);
		setHasMore(true);
		setAccountsData([]);
		if (userData?.id && isActive) {
			fetchAccounts(1, false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedType, selectedQualificationStatus, sortOrder, userData?.id, isActive]);

	useEffect(() => {
		if (accountsData.length > 0 && accountsData.length < perPage) {
			const nextPage = currentPage + 1;
			setCurrentPage(nextPage);
			fetchAccounts(nextPage, true);
		}
	}, [perPage]);

	const handleScroll = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container || isAccountsLoading || !hasMore) return;

		const scrollTop = container.scrollTop;
		const scrollHeight = container.scrollHeight;
		const clientHeight = container.clientHeight;

		// Load more when within 100px of bottom
		if (scrollTop + clientHeight >= scrollHeight - 100) {
			const nextPage = currentPage + 1;
			setCurrentPage(nextPage);
			fetchAccounts(nextPage, true);
		}
	}, [currentPage, isAccountsLoading, hasMore, fetchAccounts]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		container.addEventListener("scroll", handleScroll);
		return () => {
			container.removeEventListener("scroll", handleScroll);
		};
	}, [handleScroll]);

	const isLoadingState = isLoading || isFetching;

	const StatCard = ({
		title,
		value,
		icon,
		iconColor,
		iconBgColor,
		isLoading: loading,
		to
	}: {
		title: string;
		value: number | undefined;
		icon: string;
		iconColor: string;
		iconBgColor: string;
		isLoading: boolean;
		to?: string;
	}) => {
		const content = (
			<div className={`flex flex-row items-center justify-between gap-2 p-1.5 bg-white border border-neutral-200 rounded-lg ${to ? "hover:bg-neutral-50 cursor-pointer transition-colors" : ""}`}>
				<div className="flex flex-row gap-1.5 items-center flex-1 min-w-0">
					<div className={`flex justify-center items-center ${iconBgColor} px-0.5 rounded-full w-5 h-5 flex-shrink-0`}>
						<Icon
							icon={icon}
							width={12}
							height={12}
							className={iconColor}
						/>
					</div>
					<div className="text-neutral-900 text-xs font-semibold truncate">{title}</div>
				</div>
				<div className="flex items-center flex-shrink-0">
					{loading ? (
						<div className="flex items-center animate-pulse">
							<span className="bg-neutral-200 text-transparent rounded w-10 h-3"></span>
						</div>
					) : (
						<div className="text-neutral-900 text-xs font-semibold">
							{value?.toLocaleString() || 0}
						</div>
					)}
				</div>
			</div>
		);

		if (to) {
			return (
				<NavLink to={to} target="_blank" className="block">
					{content}
				</NavLink>
			);
		}

		return content;
	};

	const getQualificationStatusColor = (statusKey: string): string => {
		return QUALIFICATION_STATUS_COLORS[statusKey] || DEFAULT_COLOR;
	};

	// Get count by qualification status key from pie_chart_data
	const getCountByStatusKey = (statusKey: string): number => {
		const item = qualificationData?.pie_chart_data?.find(
			item => item.qualification_status_key === statusKey
		);
		return item?.count || 0;
	};

	// Get the most recent activity date for an account
	const getLastActivityDate = (account: Account): string | null => {
		const activities = [
			account.last_call_activity,
			account.last_note_activity,
			account.last_send_email_activity,
			account.last_receive_email_activity,
			account.last_activity_date,
		].filter(Boolean);

		if (activities.length === 0) return null;

		// Sort dates descending and return the most recent
		const sortedDates = activities
			.map(date => new Date(date as string).getTime())
			.sort((a, b) => b - a);

		return new Date(sortedDates[0]).toISOString();
	};

	// Get activity type icon and label
	const getActivityInfo = (account: Account) => {
		const activities = [
			{ date: account.last_call_activity, type: "call", icon: "solar:phone-calling-bold-duotone", label: "Call" },
			{ date: account.last_note_activity, type: "note", icon: "solar:notes-bold-duotone", label: "Note" },
			{ date: account.last_send_email_activity, type: "send_email", icon: "solar:letter-bold-duotone", label: "Sent Email" },
			{ date: account.last_receive_email_activity, type: "receive_email", icon: "solar:inbox-bold-duotone", label: "Received Email" },
			{ date: account.last_activity_date, type: "activity", icon: "solar:transfer-horizontal-bold", label: "Activity" },
		].filter(activity => activity.date);

		if (activities.length === 0) {
			return { icon: "solar:calendar-mark-bold-duotone", label: "No Activity", date: null };
		}

		// Sort by date descending and get the most recent
		const sortedActivities = activities.sort((a, b) => {
			const dateA = new Date(a.date as string).getTime();
			const dateB = new Date(b.date as string).getTime();
			return dateB - dateA;
		});

		return {
			icon: sortedActivities[0].icon,
			label: sortedActivities[0].label,
			date: sortedActivities[0].date,
		};
	};

	return (
		<div className="p-2 space-y-1.5">
			{/* Header Section */}
			<div className="flex items-center justify-between mb-2 pb-1.5 border-b border-neutral-200">
				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-primary-50 to-primary-100">
						<Icon
							icon="solar:user-check-rounded-bold-duotone"
							width={14}
							height={14}
							className="text-primary-600"
						/>
					</div>
					<div className="flex flex-col">
						<h5 className="font-semibold text-base text-black leading-tight">Qualification Status Overview</h5>
						<span className="text-[10px] text-neutral-500 font-normal leading-tight">Account qualification status metrics</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{/* Type Filter Toggle */}
					<div className="flex items-center gap-1 bg-neutral-100 rounded p-0.5">
						<button
							onClick={() => setSelectedType("all")}
							className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selectedType === "all"
								? "bg-white text-primary-600 shadow-sm"
								: "text-neutral-600 hover:text-neutral-900"
								}`}
						>
							Both
						</button>
						<button
							onClick={() => setSelectedType("my_own")}
							className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selectedType === "my_own"
								? "bg-white text-primary-600 shadow-sm"
								: "text-neutral-600 hover:text-neutral-900"
								}`}
						>
							My Owned Accounts
						</button>
						<button
							onClick={() => setSelectedType("account_manager")}
							className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selectedType === "account_manager"
								? "bg-white text-primary-600 shadow-sm"
								: "text-neutral-600 hover:text-neutral-900"
								}`}
						>
							Based on Account Manager
						</button>
					</div>
					{onToggleFullscreen && (
						<button
							onClick={onToggleFullscreen}
							className="p-1.5 hover:bg-neutral-100 rounded transition-colors"
							title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
						>
							<Icon
								icon={isFullscreen ? "solar:minimize-square-outline" : "solar:full-screen-square-outline"}
								width={16}
								height={16}
								className="text-neutral-600 hover:text-primary-600"
							/>
						</button>
					)}
				</div>
			</div>

			{/* Summary Statistics Row */}
			<div className="grid grid-cols-1 md:grid-cols-5 gap-1">
				<StatCard
					title="Total"
					value={qualificationData?.total_count}
					icon="solar:users-group-rounded-bold-duotone"
					iconColor="text-primary-600"
					iconBgColor="bg-primary-50"
					isLoading={isLoadingState}
					to="/account/list?showMyOwn=true"
				/>
			<StatCard
				title="Focused Accounts"
				value={getCountByStatusKey("FOCUSED_ACCOUNTS")}
				icon="solar:user-check-rounded-bold-duotone"
				iconColor="text-purple-600"
				iconBgColor="bg-purple-50"
				isLoading={isLoadingState}
				to="/account/list?qualification_status=FOCUSED_ACCOUNTS&showMyOwn=true"
			/>
			<StatCard
				title="Sales Qualified"
				value={getCountByStatusKey("SALES_QUALIFIED")}
				icon="solar:user-check-rounded-bold-duotone"
				iconColor="text-highlightColor-green"
				iconBgColor="bg-highlightColor-greenLight"
				isLoading={isLoadingState}
				to="/account/list?qualification_status=SALES_QUALIFIED&showMyOwn=true"
			/>
			<StatCard
				title="Marketing Qualified"
				value={getCountByStatusKey("MARKETING_QUALIFIED")}
				icon="solar:user-check-rounded-bold-duotone"
				iconColor="text-highlightColor-blue"
				iconBgColor="bg-highlightColor-blueLight"
				isLoading={isLoadingState}
				to="/account/list?qualification_status=MARKETING_QUALIFIED&showMyOwn=true"
			/>
			<StatCard
				title="Shortage Customer"
				value={getCountByStatusKey("SHORTAGE_CUSTOMER")}
				icon="solar:user-check-rounded-bold-duotone"
				iconColor="text-orange-600"
				iconBgColor="bg-orange-50"
				isLoading={isLoadingState}
				to="/account/list?qualification_status=SHORTAGE_CUSTOMER&showMyOwn=true"
			/>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-4 gap-1">
				{/* Pie Chart Section */}
				<div className="flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg">
					<div className="text-neutral-900 text-sm font-semibold mb-1">Status Distribution</div>
					{isLoadingState ? (
						<div className="flex items-center justify-center py-8">
							<LoadingDots size="sm" />
						</div>
					) : (() => {
						// Check if there's meaningful data (at least one count > 0)
						const hasData = qualificationData?.pie_chart_data &&
							qualificationData.pie_chart_data.length > 0 &&
							qualificationData.pie_chart_data.some(item => item.count > 0);

						if (!hasData) {
							return (
								<div className="flex flex-col items-center justify-center py-8">
									<div className="flex items-center justify-center w-20 h-20 rounded-full bg-neutral-100 mb-2">
										<Icon
											icon="solar:pie-chart-2-bold-duotone"
											width={32}
											height={32}
											className="text-neutral-400"
										/>
									</div>
									<div className="text-center">
										<p className="text-xs text-neutral-600 font-medium mb-0.5">No data available</p>
										<p className="text-[9px] text-neutral-500">No accounts in any qualification status</p>
									</div>
								</div>
							);
						}

						return (
							<div className="flex flex-col items-center">
								<ResponsiveContainer width="100%" height={isFullscreen ? 250 : 120}>
									<PieChart>
										<Pie
											data={qualificationData.pie_chart_data.map(item => ({
												name: item.qualification_status,
												value: item.count
											}))}
											cx="50%"
											cy="50%"
											outerRadius={isFullscreen ? 100 : 50}
											fill="#8884d8"
											dataKey="value"
										>
											{qualificationData.pie_chart_data.map((entry, index) => (
												<Cell
													key={`cell-${index}`}
													fill={getQualificationStatusColor(entry.qualification_status_key)}
													style={{ cursor: "pointer" }}
													onClick={() => {
														setSelectedQualificationStatus(selectedQualificationStatus === entry.qualification_status_key ? "all" : entry.qualification_status_key);
													}}
												/>
											))}
										</Pie>
										<Tooltip
											formatter={(value: number) => value.toLocaleString()}
											contentStyle={{
												fontSize: '8px',
												padding: '2px 4px',
												lineHeight: '1.2'
											}}
											itemStyle={{
												fontSize: '8px',
												padding: '0',
												margin: '0'
											}}
											labelStyle={{
												fontSize: '8px',
												marginBottom: '1px',
												padding: '0'
											}}
											wrapperStyle={{
												fontSize: '8px'
											}}
										/>
									</PieChart>
								</ResponsiveContainer>
								<div className="flex flex-wrap gap-2 justify-center mt-1">
									{qualificationData.pie_chart_data.map((item, index) => (
										<div
											key={item.qualification_status_key}
											className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
											onClick={() => {
												setSelectedQualificationStatus(selectedQualificationStatus === item.qualification_status_key ? "all" : item.qualification_status_key);
											}}
										>
											<div
												className={`w-2 h-2 rounded-full ${selectedQualificationStatus === item.qualification_status_key ? "ring-2 ring-primary-600 ring-offset-1" : ""}`}
												style={{ backgroundColor: getQualificationStatusColor(item.qualification_status_key) }}
											/>
											<span className="text-[9px] text-neutral-600">{item.qualification_status}</span>
										</div>
									))}
								</div>
							</div>
						);
					})()}
				</div>

				{/* Account List Section */}
				<div className="md:col-span-3 flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg">
					<div className="flex items-center justify-between mb-1">
						<div className="flex items-center gap-1.5">
							<Icon
								icon="solar:users-group-rounded-bold-duotone"
								width={14}
								height={14}
								className="text-neutral-600"
							/>
							<div className="text-neutral-900 text-sm font-semibold">Accounts</div>
							{!isAccountsLoading && accountsData && (
								<span className="text-[9px] text-neutral-500 font-normal">
									({totalRecords} {totalRecords === 1 ? 'account' : 'accounts'})
								</span>
							)}
						</div>
						{/* Sort Order Toggle */}
						<div className="flex items-center gap-0.5 bg-neutral-100 rounded-lg p-1 shadow-inner">
							<button
								onClick={() => setSortOrder("desc")}
								className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ease-out ${
									sortOrder === "desc"
										? "bg-white text-primary-600 shadow-sm ring-1 ring-primary-100"
										: "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 active:scale-95"
									}`}
								title="Newest first"
								aria-label="Sort by newest first"
								aria-pressed={sortOrder === "desc"}
							>
								<Icon
									icon="solar:sort-by-time-bold-duotone"
									width={13}
									height={13}
									className={sortOrder === "desc" ? "text-primary-600" : "text-neutral-400"}
								/>
								<span className="hidden sm:inline">Newest</span>
							</button>
							<button
								onClick={() => setSortOrder("asc")}
								className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ease-out ${
									sortOrder === "asc"
										? "bg-white text-primary-600 shadow-sm ring-1 ring-primary-100"
										: "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 active:scale-95"
									}`}
								title="Oldest first"
								aria-label="Sort by oldest first"
								aria-pressed={sortOrder === "asc"}
							>
								<Icon
									icon="solar:sort-by-time-bold-duotone"
									width={13}
									height={13}
									className={`rotate-180 ${sortOrder === "asc" ? "text-primary-600" : "text-neutral-400"}`}
								/>
								<span className="hidden sm:inline">Oldest</span>
							</button>
						</div>
					</div>
					{(isLoadingState || isAccountsLoading) && accountsData.length === 0 ? (
						<div className={`${isFullscreen ? "min-h-[calc(100vh-350px)]" : "min-h-52"} flex items-center justify-center py-4`}>
							<LoadingDots size="sm" />
						</div>
					) : accountsData.length > 0 ? (
						<div
							ref={scrollContainerRef}
							className={`overflow-y-auto space-y-0.5 ${isFullscreen ? "min-h-[calc(100vh-350px)] max-h-[calc(100vh-350px)]" : "min-h-52 max-h-52"}`}
						>
							{accountsData.map((account) => {
								const activityInfo = getActivityInfo(account);
								const lastActivityDate = getLastActivityDate(account);

								return (
									<div
										key={account.id}
										className="flex items-center gap-2 p-1.5 bg-neutral-50 rounded border border-neutral-100 hover:bg-neutral-100 transition-colors"
									>
										{/* Qualification Status Badge */}
										<div
											className="w-2 h-2 rounded-full flex-shrink-0"
											style={{ backgroundColor: getQualificationStatusColor(account.qualification_status) }}
										/>

										{/* Account Name */}
										<div className="min-w-32 flex-1">
											<NavLink
												className="text-primary hover:underline block min-w-0"
												to={`/account/preview/${account.id}`}
											>
												<span className="text-xs text-neutral-900 font-semibold truncate block">
													{account.account_name}
												</span>
											</NavLink>
										</div>

										{/* Owner Info */}
										<div className="min-w-28 flex items-center gap-1 flex-shrink-0">
											<Icon icon="tabler:user-bolt" width={10} height={10} className="text-neutral-500" />
											{account.owner?.avatar_data ? (
												<img
													src={displayImage(account.owner.avatar_data)}
													alt={account.owner.name}
													className="w-3 h-3 rounded-full object-cover"
												/>
											) : (
												<div className="w-3 h-3 rounded-full bg-neutral-200 flex items-center justify-center">
													<Icon
														icon="solar:user-bold-duotone"
														width={8}
														height={8}
														className="text-neutral-400"
													/>
												</div>
											)}
											<span className="text-[9px] text-neutral-600 truncate">
												{account.owner?.name ? `${account.owner.name}` : "No Owner"}
											</span>
										</div>

										{/* Account Manager Info */}
										<div className="min-w-28 flex items-center gap-1 flex-shrink-0">
											{account.account_manager?.name && (
												<>
													<Icon icon="tabler:user-shield" width={10} height={10} className="text-neutral-500" />
													{account.account_manager?.avatar_data ? (
														<img
															src={displayImage(account.account_manager.avatar_data)}
															alt={account.account_manager.name}
															className="w-3 h-3 rounded-full object-cover"
														/>
													) : (
														<div className="w-3 h-3 rounded-full bg-neutral-200 flex items-center justify-center">
															<Icon
																icon="solar:user-bold-duotone"
																width={8}
																height={8}
																className="text-neutral-400"
															/>
														</div>
													)}
													<span className="text-[9px] text-neutral-600 truncate">{account.account_manager?.name}</span>
												</>
											)}
										</div>

										{/* Activity Info */}
										<div className="min-w-28 flex items-center gap-1.5 flex-shrink-0">
											<Icon
												icon={activityInfo.icon}
												width={14}
												height={14}
												className={lastActivityDate ? "text-primary-600" : "text-neutral-400"}
											/>
											<div className="flex items-center gap-1.5 min-w-0">
												<span className="text-[9px] text-neutral-700 font-medium truncate">
													{activityInfo.label}
												</span>
												{lastActivityDate ? (
													<span className="text-[9px] text-neutral-500 truncate">
														{formatTime(lastActivityDate, "account", { withClock: false })}
													</span>
												) : (
													<span className="text-[9px] text-neutral-400">-</span>
												)}
											</div>
										</div>
									</div>
								);
							})}
							{isAccountsLoading && (
								<div className="flex items-center justify-center py-2">
									<LoadingDots size="sm" />
								</div>
							)}
							{!hasMore && accountsData.length > 0 && (
								<div className="text-center py-2 text-[9px] text-neutral-400">
									No more accounts to load
								</div>
							)}
						</div>
					) : (
						<div className="text-center py-4 text-xs text-neutral-500 min-h-52">
							No accounts found
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
