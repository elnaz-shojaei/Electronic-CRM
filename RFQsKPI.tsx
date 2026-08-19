import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getToken } from "../../../../config/config";
import { useUserStatus } from "../../../../config/authCheck";
import DashboardAPI from "../../../../config/sub-apis/dashboard.api";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import LoadingDots from "../../../../components/LoadingDots";
import moment from "moment";

interface AccountGroupItem {
	id: string;
	account_name: string;
	count: number;
	image_data: any;
}

interface RFQData {
	data: {
		statistics: {
			total_count: number;
			market_checking_count: number;
			sales_direct_count: number;
			in_review_count: number;
			pie_chart_data: Array<{
				rfq_status: string;
				count: number;
			}>;
		};
		accounts: AccountGroupItem[];
		analytics	:{
			weeks: Array<{
				week_start: string;
				week_end: string;
				week_label: string;
				count: number;
			}>;
			days: Array<{
				date: string;
				date_label: string;
				day_name: string;
				count: number;
			}>;
		};
	};
	has_more_pages?: boolean;
	page?: number;
}


// Color mapping for RFQ statuses
const RFQ_STATUS_COLORS: Record<string, string> = {
	"Market Checking": "#2196F3",           // Blue
	"Sales Direct": "#805DCA",              // Purple
	"In review": "#529553",                 // Green
	"Quote": "#805DCA",                     // Purple
	"Lost": "#E44F5D",                      // Red
	"Product Must be Checked": "#BA8C55",   // Brown
	"No Sourcing": "#545454",               // Gray
};

// Fallback color for unknown statuses
const DEFAULT_COLOR = "#545454";

interface SalesPersonRFQKPIsProps {
	isFullscreen?: boolean;
	onToggleFullscreen?: () => void;
	isActive?: boolean;
}

export default function SalesPersonRFQKPIs({ isFullscreen = false, onToggleFullscreen, isActive = true }: SalesPersonRFQKPIsProps) {
	const dashboardApi = new DashboardAPI();
	const userData = getToken("userData");
	const [chartView, setChartView] = useState<"weeks" | "days">("days");
	const [selectedType, setSelectedType] = useState<"all" | "my_own" | "account_owner">("all");
	const [selectedRfqStatus, setSelectedRfqStatus] = useState<string>("all");
	const { hasPermission } = useUserStatus();

	const { data: rfqData, isLoading, isFetching } = useQuery<RFQData>({
		queryKey: ["sales-person-rfqs", userData?.id, selectedType, selectedRfqStatus],
		queryFn: async () => {
			const result = await dashboardApi.kpisRfqs("personal", "accounts", userData?.id, selectedType, selectedRfqStatus);
			return result.data;
		},
		enabled: !!userData?.id && isActive,
	});

	const showTrendChart = hasPermission("view-dashboard-rfq-chart");

	const isLoadingState = isLoading || isFetching;
	// const isChartLoadingState = isChartLoading || isChartFetching; // Commented out - no longer using chart loading state

	// Calculate date range for past 4 weeks
	const dateTo = moment().format("YYYY-MM-DD");
	const dateFrom = moment().subtract(4, "weeks").format("YYYY-MM-DD");

	// Helper function to build status query params string based on selectedRfqStatus
	const buildStatusQueryParams = (selectedStatus: string, pieChartData?: Array<{ rfq_status: string; count: number }>): string => {
		if (selectedStatus === "all") {
			// When "all" is selected, include all available statuses from pie chart data
			if (pieChartData && pieChartData.length > 0) {
				return pieChartData.map(item => `status=${encodeURIComponent(item.rfq_status)}`).join("&");
			}
			return "";
		} else {
			// When a specific status is selected, include only that status
			return `status=${encodeURIComponent(selectedStatus)}`;
		}
	};

	// Helper function to build URL with date params
	const buildRfqDashboardUrl = (baseUrl: string): string => {
		const url = new URL(baseUrl, window.location.origin);
		// Preserve all existing status params (in case there are multiple)
		const existingStatusParams = url.searchParams.getAll("status");
		// Set date params
		url.searchParams.set("dateFrom", dateFrom);
		url.searchParams.set("dateTo", dateTo);
		// Re-add all status params (URLSearchParams.set might have removed duplicates)
		url.searchParams.delete("status");
		existingStatusParams.forEach(status => {
			url.searchParams.append("status", status);
		});
		// Return relative path
		return url.pathname + url.search;
	};

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
				<Link to={to} target="_blank" className="block">
					{content}
				</Link>
			);
		}

		return content;
	};

	// Prepare chart data based on selected view
	const chartDataForView = chartView === "weeks"
		? rfqData?.data?.analytics?.weeks.map(week => ({ label: week.week_label, count: week.count })) || []
		: rfqData?.data?.analytics?.days.map(day => ({ label: `${day.day_name} ${day.date.split('-')[2]}`, count: day.count, fullLabel: day.date_label })) || [];


	return (
		<div className="p-2 space-y-1.5">
			{/* Header Section */}
			<div className="flex items-center justify-between mb-2 pb-1.5 border-b border-neutral-200">
				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-primary-50 to-primary-100">
						<Icon
							icon="solar:document-text-bold-duotone"
							width={14}
							height={14}
							className="text-primary-600"
						/>
					</div>
					<div className="flex flex-col">
						<h5 className="font-semibold text-base text-black leading-tight">RFQ Overview
							<span className="ml-1 text-[10px] text-neutral-500 font-normal leading-tight">(past 4 weeks)</span>
						</h5>
						<span className="text-[10px] text-neutral-500 font-normal leading-tight">Request for Quotation metrics</span>
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
							Based on My Owned RFQs
						</button>
						<button
							onClick={() => setSelectedType("account_owner")}
							className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selectedType === "account_owner"
								? "bg-white text-primary-600 shadow-sm"
								: "text-neutral-600 hover:text-neutral-900"
								}`}
						>
							Based on My Owned Accounts
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
			<div className="grid grid-cols-1 md:grid-cols-4 gap-1">
				<StatCard
					title="Total"
					value={rfqData?.data?.statistics?.total_count}
					icon="solar:document-text-bold-duotone"
					iconColor="text-primary-600"
					iconBgColor="bg-primary-50"
					isLoading={isLoadingState}
					to="/rfq/dashboard"
				/>
				<StatCard
					title="Market Checking"
					value={rfqData?.data?.statistics?.market_checking_count}
					icon="solar:search-bold-duotone"
					iconColor="text-highlightColor-blue"
					iconBgColor="bg-highlightColor-blueLight"
					isLoading={isLoadingState}
					to="/rfq/dashboard?status=Market Checking"
				/>
				<StatCard
					title="Sales Direct"
					value={rfqData?.data?.statistics?.sales_direct_count}
					icon="solar:handshake-bold-duotone"
					iconColor="text-highlightColor-green"
					iconBgColor="bg-highlightColor-greenLight"
					isLoading={isLoadingState}
					to="/rfq/dashboard?status=Sales Direct"
				/>
				<StatCard
					title="In Review"
					value={rfqData?.data?.statistics?.in_review_count}
					icon="solar:document-check-bold-duotone"
					iconColor="text-highlightColor-yellow"
					iconBgColor="bg-highlightColor-yellowLight"
					isLoading={isLoadingState}
					to="/rfq/dashboard?status=In Review"
				/>
			</div>

			<div className={`grid grid-cols-1 ${showTrendChart ? "md:grid-cols-5" : "md:grid-cols-4"} gap-1`}>
				{/* Pie Chart Section */}
				<div className="flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg">
					<div className="text-neutral-900 text-sm font-semibold mb-1">Status Distribution</div>
					{isLoadingState ? (
						<div className="flex items-center justify-center py-8">
							<LoadingDots size="sm" />
						</div>
					) : (() => {
						// Check if there's meaningful data (at least one count > 0)
						const pieChartData = rfqData?.data?.statistics?.pie_chart_data;
						const hasData = pieChartData &&
							pieChartData.length > 0 &&
							pieChartData.some(item => item.count > 0);

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
										<p className="text-[9px] text-neutral-500">No RFQs in any status</p>
									</div>
								</div>
							);
						}

						return (
							<div className="flex flex-col items-center">
								<ResponsiveContainer width="100%" height={isFullscreen ? 250 : 120}>
									<PieChart>
										<Pie
											data={pieChartData!.map(item => ({
												name: item.rfq_status,
												value: item.count
											}))}
											cx="50%"
											cy="50%"
											outerRadius={isFullscreen ? 100 : 50}
											fill="#8884d8"
											dataKey="value"
										>
											{pieChartData!.map((entry, index) => (
												<Cell
													key={`cell-${index}`}
													fill={RFQ_STATUS_COLORS[entry.rfq_status] || DEFAULT_COLOR}
													style={{ cursor: "pointer" }}
													onClick={() => {
														setSelectedRfqStatus(selectedRfqStatus === entry.rfq_status ? "all" : entry.rfq_status);
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
									{pieChartData!.map((item, index) => (
										<div
											key={item.rfq_status}
											className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
											onClick={() => {
												setSelectedRfqStatus(selectedRfqStatus === item.rfq_status ? "all" : item.rfq_status);
											}}
										>
											<div
												className={`w-2 h-2 rounded-full ${selectedRfqStatus === item.rfq_status ? "ring-2 ring-primary-600 ring-offset-1" : ""}`}
												style={{ backgroundColor: RFQ_STATUS_COLORS[item.rfq_status] || DEFAULT_COLOR }}
											/>
											<span className="text-[9px] text-neutral-600">{item.rfq_status}</span>
										</div>
									))}
								</div>
							</div>
						);
					})()}
				</div>

				{/* Chart Section */}
				{showTrendChart && (
					<div className="md:col-span-2 flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg">
						<div className="flex items-center justify-between mb-1">
							<div className="flex items-center gap-1.5">
								<Icon
									icon="solar:chart-2-bold-duotone"
									width={14}
									height={14}
									className="text-neutral-600"
								/>
								<div className="text-neutral-900 text-sm font-semibold">RFQ Trend</div>
							</div>
							{/* View Toggle */}
							<div className="flex items-center gap-1 bg-neutral-100 rounded p-0.5">
								<button
									onClick={() => setChartView("weeks")}
									className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${chartView === "weeks"
										? "bg-white text-primary-600 shadow-sm"
										: "text-neutral-600 hover:text-neutral-900"
										}`}
								>
									Weeks
								</button>
								<button
									onClick={() => setChartView("days")}
									className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${chartView === "days"
										? "bg-white text-primary-600 shadow-sm"
										: "text-neutral-600 hover:text-neutral-900"
										}`}
								>
									Days
								</button>
							</div>
						</div>
						{isLoadingState ? (
							<div className="flex items-center justify-center h-[200px]">
								<LoadingDots size="sm" />
							</div>
						) : chartDataForView.length > 0 ? (
							<div className="h-[200px]">
								<ResponsiveContainer width="100%" height="100%">
									<LineChart
										data={chartDataForView}
										margin={{ top: 5, right: 10, left: 20, bottom: 5 }}
									>
										<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
										<XAxis
											dataKey="label"
											tick={{ fontSize: 10, fill: '#6b7280' }}
											interval={chartView === "days" ? Math.floor(chartDataForView.length / 7) : 0}
										/>
										<YAxis
											tick={{ fontSize: 10, fill: '#6b7280' }}
											width={30}
										/>
										<Tooltip
											contentStyle={{
												backgroundColor: 'white',
												border: '1px solid #e5e7eb',
												borderRadius: '6px',
												fontSize: '11px',
												padding: '6px 8px'
											}}
											formatter={(value: number) => [value, 'Count']}
										/>
										<Line
											type="monotone"
											dataKey="count"
											stroke="#3b82f6"
											strokeWidth={2}
											dot={false}
											activeDot={{ r: 5 }}
										/>
									</LineChart>
								</ResponsiveContainer>
							</div>
						) : (
							<div className="flex items-center justify-center h-[200px] text-xs text-neutral-500">
								No chart data available
							</div>
						)}
					</div>
				)}

				{/* Account Grouping Section */}
				<div className={`${showTrendChart ? "md:col-span-2" : "md:col-span-3"} flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg`}>
					<div className="flex items-center gap-1.5 mb-1">
						<Icon
							icon="solar:users-group-rounded-bold-duotone"
							width={14}
							height={14}
							className="text-neutral-600"
						/>
						<div className="text-neutral-900 text-sm font-semibold">Accounts</div>
						{!isLoadingState && rfqData?.data?.accounts && rfqData.data.accounts.length > 0 && (
							<span className="text-[9px] text-neutral-500 font-normal">
								({rfqData.data.accounts.length} {rfqData.data.accounts.length === 1 ? 'account' : 'accounts'})
							</span>
						)}
					</div>
					{isLoadingState && (!rfqData?.data?.accounts || rfqData.data.accounts.length === 0) ? (
						<div className={`${isFullscreen ? "min-h-[calc(100vh-350px)]" : "min-h-52"} flex items-center justify-center py-4`}>
							<LoadingDots size="sm" />
						</div>
					) : rfqData?.data?.accounts && rfqData.data.accounts.length > 0 ? (
						<div
							className={`overflow-y-auto space-y-1 ${isFullscreen ? "min-h-[calc(100vh-350px)] max-h-[calc(100vh-350px)]" : "min-h-52 max-h-52"}`}
						>
							{rfqData.data.accounts.map((item) => (
								<div
									key={item.id}
									className="flex flex-col gap-1 p-1.5 bg-neutral-50 rounded border border-neutral-100 hover:bg-neutral-100 transition-colors"
								>
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-1.5 flex-1 min-w-0">
											{/* {item.image_data ? (
												<img
													src={item.image_data}
													alt={item.account_name}
													className="w-5 h-5 rounded-full object-cover flex-shrink-0"
												/>
											) : ( */}
												<div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0">
													<Icon
														icon="solar:user-bold-duotone"
														width={12}
														height={12}
														className="text-neutral-400"
													/>
												</div>
											{/* )} */}
											<Link
												target="_blank"
												className="text-primary hover:underline min-w-0 flex-1 overflow-hidden"
												to={`/account/preview/${item.id}`}
											>
												<span className="text-xs text-neutral-900 font-medium truncate block">
													{item.account_name}
												</span>
											</Link>
										</div>
										<Link
											target="_blank"
											to={buildRfqDashboardUrl(`/rfq/dashboard?showMyOwn=true&account=${item.id}${(() => {
												const statusParams = buildStatusQueryParams(selectedRfqStatus, rfqData?.data?.statistics?.pie_chart_data);
												return statusParams ? `&${statusParams}` : "";
											})()}`)}
											className="flex items-center gap-1 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
										>
											<span className="text-xs text-neutral-600 font-normal">
												{item.count}
											</span>
											<span className="text-[9px] text-neutral-400 font-normal">
												RFQ{item.count !== 1 ? 's' : ''}
											</span>
										</Link>
									</div>
								</div>
							))}
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
